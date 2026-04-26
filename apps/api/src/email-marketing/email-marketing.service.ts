import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@trainova/db';
import {
  CreateEmailCampaignInput,
  CreateEmailDripSequenceInput,
  CreateEmailDripStepInput,
  EmailCampaignStatus,
  EmailSegment,
  EmailSegmentSchema,
  ListDripEnrollmentsQuery,
  ListEmailCampaignsQuery,
  UpdateEmailCampaignInput,
  UpdateEmailDripSequenceInput,
  UpdateEmailDripStepInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AdsService } from '../ads/ads.service';
import {
  NEWSLETTER_AD_TOKEN,
  applyNewsletterAd,
  pickAndRecordNewsletterAd,
} from '../ads/newsletter-ad.util';

/**
 * Hard caps on cron pass to keep load predictable. Each cron tick claims at
 * most this many campaigns / drip enrollments and processes them sequentially.
 * If the queue is bigger, the next tick picks up the rest.
 */
const CRON_CAMPAIGN_BATCH = 5;
const CRON_DRIP_BATCH = 100;
const CRON_RECIPIENTS_PER_CAMPAIGN = 500;

type CampaignLocale = 'en' | 'ar' | 'fr' | 'es';

@Injectable()
export class EmailMarketingService {
  private readonly logger = new Logger(EmailMarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly ads: AdsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve the absolute base URL the API is reachable at, used to build the
   * tracked click links inside newsletter ad blocks. Falls back to localhost
   * for dev so the email body still validates.
   */
  private resolveApiBaseUrl(): string {
    return (
      this.config.get<string>('API_URL') ??
      this.config.get<string>('NEXT_PUBLIC_API_URL') ??
      'http://localhost:4000'
    );
  }

  // ===========================
  // Campaign CRUD
  // ===========================

  async listCampaigns(q: ListEmailCampaignsQuery) {
    const where: Prisma.EmailCampaignWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.emailCampaign.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { sends: true } },
        },
      }),
      this.prisma.emailCampaign.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async getCampaign(id: string) {
    const row = await this.prisma.emailCampaign.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { sends: true } },
      },
    });
    if (!row) throw new NotFoundException('Campaign not found');
    return row;
  }

  async createCampaign(input: CreateEmailCampaignInput, createdById: string) {
    const status: EmailCampaignStatus = input.scheduledFor ? 'SCHEDULED' : 'DRAFT';
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (scheduledFor && scheduledFor.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledFor must be in the future');
    }
    return this.prisma.emailCampaign.create({
      data: {
        name: input.name,
        kind: 'BROADCAST',
        status,
        locale: input.locale,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText,
        segmentJson: input.segment as unknown as Prisma.InputJsonValue,
        scheduledFor,
        createdById,
      },
    });
  }

  async updateCampaign(id: string, patch: UpdateEmailCampaignInput) {
    const existing = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      throw new ConflictException('Campaign is no longer editable');
    }
    return this.prisma.emailCampaign.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
        ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
        ...(patch.bodyHtml !== undefined ? { bodyHtml: patch.bodyHtml } : {}),
        ...(patch.bodyText !== undefined ? { bodyText: patch.bodyText } : {}),
        ...(patch.segment !== undefined
          ? { segmentJson: patch.segment as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async deleteCampaign(id: string) {
    const existing = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status === 'SENDING') {
      throw new ConflictException('Cannot delete a campaign that is currently sending');
    }
    await this.prisma.emailCampaign.delete({ where: { id } });
  }

  async scheduleCampaign(id: string, when: Date) {
    if (when.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledFor must be in the future');
    }
    const existing = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      throw new ConflictException('Only DRAFT or SCHEDULED campaigns can be (re)scheduled');
    }
    return this.prisma.emailCampaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledFor: when },
    });
  }

  async cancelCampaign(id: string) {
    const existing = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status !== 'SCHEDULED' && existing.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT or SCHEDULED campaigns can be cancelled');
    }
    return this.prisma.emailCampaign.update({
      where: { id },
      data: { status: 'CANCELLED', scheduledFor: null },
    });
  }

  /**
   * Atomic-claim send: flips DRAFT/SCHEDULED -> SENDING, then dispatches to
   * the resolved recipient set. Idempotency is per-(campaign,user) on the
   * EmailCampaignSend table.
   */
  async sendCampaignNow(id: string): Promise<{ id: string; sent: number; failed: number }> {
    const claimed = await this.prisma.emailCampaign.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: { status: 'SENDING', startedAt: new Date() },
    });
    if (claimed.count === 0) {
      const existing = await this.prisma.emailCampaign.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Campaign not found');
      throw new ConflictException(`Campaign is in status ${existing.status}; cannot send`);
    }
    return this.runCampaign(id);
  }

  // ===========================
  // Segment resolution
  // ===========================

  resolveSegmentWhere(segment: EmailSegment): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (segment.roles && segment.roles.length) where.role = { in: segment.roles };
    if (segment.statuses && segment.statuses.length) where.status = { in: segment.statuses };
    else where.status = 'ACTIVE'; // sane default — never email suspended/pending
    if (segment.locales && segment.locales.length) where.locale = { in: segment.locales };
    if (segment.onlyVerified !== false) where.emailVerifiedAt = { not: null };
    const createdAt: Prisma.DateTimeFilter = {};
    if (segment.createdAfter) createdAt.gte = new Date(segment.createdAfter);
    if (segment.createdBefore) createdAt.lt = new Date(segment.createdBefore);
    if (Object.keys(createdAt).length) where.createdAt = createdAt;
    return where;
  }

  async previewSegment(segment: EmailSegment) {
    const where = this.resolveSegmentWhere(segment);
    const [count, sample] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, role: true, locale: true },
      }),
    ]);
    return { count, sample };
  }

  parseSegmentJson(raw: string): EmailSegment {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('segment must be valid JSON');
    }
    const result = EmailSegmentSchema.safeParse(parsed);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Invalid segment',
        issues: result.error.flatten(),
      });
    }
    return result.data;
  }

  // ===========================
  // Drip CRUD
  // ===========================

  async listDripSequences() {
    return this.prisma.emailDripSequence.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: { select: { steps: true, enrollments: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getDripSequence(id: string) {
    const row = await this.prisma.emailDripSequence.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { order: 'asc' } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!row) throw new NotFoundException('Drip sequence not found');
    return row;
  }

  async createDripSequence(input: CreateEmailDripSequenceInput, createdById: string) {
    try {
      return await this.prisma.emailDripSequence.create({
        data: {
          name: input.name,
          slug: input.slug,
          trigger: input.trigger,
          enabled: input.enabled ?? true,
          createdById,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A drip sequence with that slug already exists');
      }
      throw err;
    }
  }

  async updateDripSequence(id: string, patch: UpdateEmailDripSequenceInput) {
    const existing = await this.prisma.emailDripSequence.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Drip sequence not found');
    try {
      return await this.prisma.emailDripSequence.update({ where: { id }, data: patch });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A drip sequence with that slug already exists');
      }
      throw err;
    }
  }

  async deleteDripSequence(id: string) {
    const existing = await this.prisma.emailDripSequence.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Drip sequence not found');
    await this.prisma.emailDripSequence.delete({ where: { id } });
  }

  async addDripStep(sequenceId: string, input: CreateEmailDripStepInput) {
    const seq = await this.prisma.emailDripSequence.findUnique({
      where: { id: sequenceId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!seq) throw new NotFoundException('Drip sequence not found');
    const order = seq.steps.length;
    const lastStep = seq.steps[seq.steps.length - 1];
    const lastDelay = lastStep ? lastStep.delayMinutes : -1;
    if (input.delayMinutes <= lastDelay) {
      throw new BadRequestException(
        `delayMinutes must be strictly greater than the previous step (${lastDelay}).`,
      );
    }
    return this.prisma.emailDripStep.create({
      data: {
        sequenceId,
        order,
        delayMinutes: input.delayMinutes,
        locale: input.locale,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText,
      },
    });
  }

  async updateDripStep(sequenceId: string, stepId: string, patch: UpdateEmailDripStepInput) {
    const step = await this.prisma.emailDripStep.findUnique({ where: { id: stepId } });
    if (!step || step.sequenceId !== sequenceId) {
      throw new NotFoundException('Drip step not found');
    }
    if (patch.delayMinutes !== undefined) {
      const siblings = await this.prisma.emailDripStep.findMany({
        where: { sequenceId, NOT: { id: stepId } },
        orderBy: { order: 'asc' },
      });
      const prev = siblings.filter((s) => s.order < step.order).pop();
      const next = siblings.find((s) => s.order > step.order);
      if (prev && patch.delayMinutes <= prev.delayMinutes) {
        throw new BadRequestException(
          `delayMinutes must be > previous step (${prev.delayMinutes}).`,
        );
      }
      if (next && patch.delayMinutes >= next.delayMinutes) {
        throw new BadRequestException(
          `delayMinutes must be < next step (${next.delayMinutes}).`,
        );
      }
    }
    return this.prisma.emailDripStep.update({
      where: { id: stepId },
      data: patch,
    });
  }

  async deleteDripStep(sequenceId: string, stepId: string) {
    const step = await this.prisma.emailDripStep.findUnique({ where: { id: stepId } });
    if (!step || step.sequenceId !== sequenceId) {
      throw new NotFoundException('Drip step not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.emailDripStep.delete({ where: { id: stepId } });
      // Re-pack `order` so it stays contiguous and the unique index holds.
      const remaining = await tx.emailDripStep.findMany({
        where: { sequenceId },
        orderBy: { order: 'asc' },
      });
      // First shift everyone above the gap to a unique negative slot, then
      // assign final 0..n-1. Two-phase update avoids transient unique-index
      // collisions on the `(sequenceId, order)` constraint.
      for (let i = 0; i < remaining.length; i++) {
        const row = remaining[i]!;
        await tx.emailDripStep.update({
          where: { id: row.id },
          data: { order: -1000 - i },
        });
      }
      for (let i = 0; i < remaining.length; i++) {
        const row = remaining[i]!;
        await tx.emailDripStep.update({
          where: { id: row.id },
          data: { order: i },
        });
      }
      // currentStepIdx on each EmailDripEnrollment is an index into the
      // ordered steps array. After re-packing, every enrollment whose
      // index pointed past the deleted slot must shift down by one so it
      // still references the same logical step. Enrollments whose index
      // equalled the deleted slot are left as-is — currentStepIdx then
      // naturally points at the step that slid into that position.
      // Enrollments past the new last step are marked completed.
      const stepCount = remaining.length;
      await tx.emailDripEnrollment.updateMany({
        where: {
          sequenceId,
          completedAt: null,
          cancelledAt: null,
          currentStepIdx: { gt: step.order },
        },
        data: { currentStepIdx: { decrement: 1 } },
      });
      if (stepCount === 0) {
        await tx.emailDripEnrollment.updateMany({
          where: { sequenceId, completedAt: null, cancelledAt: null },
          data: { completedAt: new Date(), nextRunAt: null },
        });
      } else {
        await tx.emailDripEnrollment.updateMany({
          where: {
            sequenceId,
            completedAt: null,
            cancelledAt: null,
            currentStepIdx: { gte: stepCount },
          },
          data: { completedAt: new Date(), nextRunAt: null },
        });
      }
    });
  }

  async enrollUser(sequenceId: string, userId: string) {
    const seq = await this.prisma.emailDripSequence.findUnique({
      where: { id: sequenceId },
      include: { steps: { orderBy: { order: 'asc' }, take: 1 } },
    });
    if (!seq) throw new NotFoundException('Drip sequence not found');
    if (!seq.enabled) throw new ConflictException('Sequence is disabled');
    const firstStep = seq.steps[0];
    if (!firstStep) throw new ConflictException('Sequence has no steps');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const nextRunAt = new Date(Date.now() + firstStep.delayMinutes * 60_000);
    try {
      return await this.prisma.emailDripEnrollment.create({
        data: { sequenceId, userId, currentStepIdx: 0, nextRunAt },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('User is already enrolled in this sequence');
      }
      throw err;
    }
  }

  async listEnrollments(q: ListDripEnrollmentsQuery) {
    const where: Prisma.EmailDripEnrollmentWhereInput = {};
    if (q.sequenceId) where.sequenceId = q.sequenceId;
    if (q.state === 'ACTIVE') {
      where.completedAt = null;
      where.cancelledAt = null;
    } else if (q.state === 'COMPLETED') {
      where.completedAt = { not: null };
    } else if (q.state === 'CANCELLED') {
      where.cancelledAt = { not: null };
    }
    const [items, total] = await Promise.all([
      this.prisma.emailDripEnrollment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          user: { select: { id: true, name: true, email: true } },
          sequence: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.emailDripEnrollment.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async cancelEnrollment(id: string) {
    const existing = await this.prisma.emailDripEnrollment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Enrollment not found');
    if (existing.cancelledAt || existing.completedAt) return existing;
    return this.prisma.emailDripEnrollment.update({
      where: { id },
      data: { cancelledAt: new Date(), nextRunAt: null },
    });
  }

  // ===========================
  // Cron processors
  // ===========================

  @Cron(CronExpression.EVERY_MINUTE)
  async cron(): Promise<void> {
    if (process.env.EMAIL_MARKETING_CRON_DISABLED === '1') return;
    try {
      await this.processDueCampaigns();
    } catch (err) {
      this.logger.error(
        `processDueCampaigns failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      await this.processDueDripSteps();
    } catch (err) {
      this.logger.error(
        `processDueDripSteps failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Atomically claims due campaigns one by one (`updateMany` with a status
   * filter is the lock) and runs them. Doing this in a loop instead of one
   * big `findMany`+`updateMany` lets us bound concurrency to a single
   * campaign at a time without leaving rows in `SCHEDULED` past their time.
   */
  async processDueCampaigns(now: Date = new Date()): Promise<void> {
    for (let i = 0; i < CRON_CAMPAIGN_BATCH; i++) {
      const next = await this.prisma.emailCampaign.findFirst({
        where: { status: 'SCHEDULED', scheduledFor: { lte: now } },
        orderBy: [{ scheduledFor: 'asc' }],
        select: { id: true },
      });
      if (!next) return;
      const claimed = await this.prisma.emailCampaign.updateMany({
        where: { id: next.id, status: 'SCHEDULED' },
        data: { status: 'SENDING', startedAt: new Date() },
      });
      if (claimed.count === 0) continue;
      await this.runCampaign(next.id);
    }
  }

  /**
   * Resolve segment, materialise PENDING send rows (idempotent on the
   * unique (campaignId,userId) index), then process them. Final status is
   * `SENT` if any send succeeded, `FAILED` if all failed, otherwise still
   * `SENT` with `failedCount > 0`.
   */
  private async runCampaign(id: string): Promise<{ id: string; sent: number; failed: number }> {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    let segment: EmailSegment;
    try {
      segment = EmailSegmentSchema.parse(campaign.segmentJson);
    } catch {
      this.logger.error(`Campaign ${id} has invalid segmentJson; marking FAILED`);
      await this.prisma.emailCampaign.update({
        where: { id },
        data: { status: 'FAILED', finishedAt: new Date() },
      });
      return { id, sent: 0, failed: 0 };
    }
    const where = this.resolveSegmentWhere(segment);
    let sent = 0;
    let failed = 0;
    let cursor: string | undefined = undefined;
    // Cursor-paginate the entire segment in batches of CRON_RECIPIENTS_PER_CAMPAIGN.
    // The previous implementation took only the first batch and finalised the
    // campaign, silently dropping every recipient beyond it. Per-(campaign,user)
    // idempotency on EmailCampaignSend means re-runs are safe if this method
    // is interrupted mid-way.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const recipients: { id: string; name: string; email: string }[] =
        await this.prisma.user.findMany({
          where,
          select: { id: true, name: true, email: true },
          orderBy: { id: 'asc' },
          take: CRON_RECIPIENTS_PER_CAMPAIGN,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
      if (recipients.length === 0) break;
      for (const r of recipients) {
        const sendRow = await this.prisma.emailCampaignSend.upsert({
          where: { campaignId_userId: { campaignId: id, userId: r.id } },
          create: { campaignId: id, userId: r.id, status: 'PENDING' },
          update: {},
        });
        if (sendRow.status === 'SENT' || sendRow.status === 'SKIPPED') continue;
        try {
          // Resolve a per-recipient newsletter ad slot only if the campaign
          // body opted in via the AD_SLOT token. We pick + record an
          // impression per recipient (stable session hash so the existing
          // frequency-cap logic still works) and substitute the rendered
          // block. If no eligible creative exists, the token is stripped
          // and the email reads as if the slot wasn't there. T9.F.
          const wantsAd =
            campaign.bodyHtml.includes(NEWSLETTER_AD_TOKEN) ||
            (campaign.bodyText?.includes(NEWSLETTER_AD_TOKEN) ?? false);
          const ad = wantsAd
            ? await pickAndRecordNewsletterAd(this.ads, this.resolveApiBaseUrl(), {
                campaignId: id,
                recipientId: r.id,
                recipientEmail: r.email,
                locale: campaign.locale as CampaignLocale,
              })
            : null;
          const { bodyHtml, bodyText } = wantsAd
            ? applyNewsletterAd(campaign.bodyHtml, campaign.bodyText, ad)
            : { bodyHtml: campaign.bodyHtml, bodyText: campaign.bodyText };

          await this.email.sendCampaignRaw({
            to: r.email,
            locale: campaign.locale as CampaignLocale,
            subject: campaign.subject,
            bodyHtml,
            bodyText,
            vars: { name: r.name },
          });
          await this.prisma.emailCampaignSend.update({
            where: { id: sendRow.id },
            data: { status: 'SENT', sentAt: new Date(), error: null },
          });
          sent++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Campaign ${id} -> ${r.email} failed: ${message}`);
          await this.prisma.emailCampaignSend.update({
            where: { id: sendRow.id },
            data: { status: 'FAILED', error: message.slice(0, 1000) },
          });
          failed++;
        }
      }
      cursor = recipients[recipients.length - 1]!.id;
      if (recipients.length < CRON_RECIPIENTS_PER_CAMPAIGN) break;
    }
    const finalStatus = sent === 0 && failed > 0 ? 'FAILED' : 'SENT';
    await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: finalStatus,
        sentCount: { increment: sent },
        failedCount: { increment: failed },
        finishedAt: new Date(),
      },
    });
    return { id, sent, failed };
  }

  /**
   * Picks up enrollments whose `nextRunAt` is due, sends the current step,
   * and either advances to the next step (re-arming `nextRunAt`) or marks
   * the enrollment `completedAt` if the step was the last one.
   */
  async processDueDripSteps(now: Date = new Date()): Promise<void> {
    // Filter disabled sequences at the query level. The previous version
    // post-filtered with `if (!e.sequence.enabled) continue;` after the
    // `take: CRON_DRIP_BATCH` cap, so a disabled sequence holding ≥100
    // due enrollments would consume the whole batch every tick (always
    // ordered first by `nextRunAt asc`) and starve every other sequence
    // permanently. Pushing the predicate into Prisma keeps the cron fair.
    const due = await this.prisma.emailDripEnrollment.findMany({
      where: {
        nextRunAt: { lte: now },
        completedAt: null,
        cancelledAt: null,
        sequence: { enabled: true },
      },
      orderBy: [{ nextRunAt: 'asc' }],
      take: CRON_DRIP_BATCH,
      include: {
        sequence: {
          include: { steps: { orderBy: { order: 'asc' } } },
        },
        user: { select: { id: true, name: true, email: true, status: true } },
      },
    });
    for (const e of due) {
      if (e.user.status !== 'ACTIVE') {
        await this.prisma.emailDripEnrollment.update({
          where: { id: e.id },
          data: { cancelledAt: new Date(), nextRunAt: null },
        });
        continue;
      }
      const step = e.sequence.steps[e.currentStepIdx];
      if (!step) {
        await this.prisma.emailDripEnrollment.update({
          where: { id: e.id },
          data: { completedAt: new Date(), nextRunAt: null },
        });
        continue;
      }
      try {
        // Same opt-in-by-token newsletter ad slot as broadcast campaigns.
        // Drip enrollments are per-(sequence, user), so the recipientEmail
        // alone gives a stable hash for frequency-cap accounting across
        // re-enrollments. T9.F.
        const wantsAd =
          step.bodyHtml.includes(NEWSLETTER_AD_TOKEN) ||
          (step.bodyText?.includes(NEWSLETTER_AD_TOKEN) ?? false);
        const ad = wantsAd
          ? await pickAndRecordNewsletterAd(this.ads, this.resolveApiBaseUrl(), {
              campaignId: e.sequenceId,
              recipientId: e.user.id,
              recipientEmail: e.user.email,
              locale: step.locale as CampaignLocale,
            })
          : null;
        const { bodyHtml, bodyText } = wantsAd
          ? applyNewsletterAd(step.bodyHtml, step.bodyText, ad)
          : { bodyHtml: step.bodyHtml, bodyText: step.bodyText };

        await this.email.sendCampaignRaw({
          to: e.user.email,
          locale: step.locale as CampaignLocale,
          subject: step.subject,
          bodyHtml,
          bodyText,
          vars: { name: e.user.name },
        });
      } catch (err) {
        this.logger.error(
          `Drip ${e.id} step ${e.currentStepIdx} failed: ${
            err instanceof Error ? err.message : String(err)
          }. Will retry next tick.`,
        );
        await this.prisma.emailDripEnrollment.update({
          where: { id: e.id },
          data: { nextRunAt: new Date(now.getTime() + 5 * 60_000) },
        });
        continue;
      }
      const nextIdx = e.currentStepIdx + 1;
      const nextStep = e.sequence.steps[nextIdx];
      if (!nextStep) {
        await this.prisma.emailDripEnrollment.update({
          where: { id: e.id },
          data: {
            currentStepIdx: nextIdx,
            completedAt: new Date(),
            nextRunAt: null,
          },
        });
      } else {
        // Drift-resistant scheduling: anchor on enrollment time so a slow
        // worker tick can't push the whole sequence back.
        const anchor = e.createdAt.getTime();
        const nextRunAt = new Date(anchor + nextStep.delayMinutes * 60_000);
        await this.prisma.emailDripEnrollment.update({
          where: { id: e.id },
          data: { currentStepIdx: nextIdx, nextRunAt },
        });
      }
    }
  }
}
