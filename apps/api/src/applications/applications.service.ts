import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  APPLICATION_STATUS_TRANSITIONS,
  AUDIT_ACTIONS,
  applicationFormSchema,
  canTransitionApplicationStatus,
  validateAnswers,
  type ApplicationForm,
  type ApplyToRequestInput,
} from '@trainova/shared';
import type { ApplicationStatus, Prisma } from '@trainova/db';

interface StatusUpdateContext {
  ip?: string | null;
  userAgent?: string | null;
  locale?: string | null;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
    private readonly notifications: NotificationsService,
  ) {}

  async listMine(trainerId: string) {
    return this.prisma.application.findMany({
      where: { trainerId },
      orderBy: { createdAt: 'desc' },
      include: {
        request: {
          select: {
            id: true,
            slug: true,
            title: true,
            modelFamily: true,
            industry: true,
            status: true,
            company: {
              select: {
                name: true,
                slug: true,
                logoUrl: true,
                verified: true,
                ownerId: true,
              },
            },
          },
        },
      },
    });
  }

  async apply(trainerId: string, input: ApplyToRequestInput) {
    const request = await this.prisma.jobRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'OPEN') throw new BadRequestException('Request is not open');

    const existing = await this.prisma.application.findUnique({
      where: { requestId_trainerId: { requestId: input.requestId, trainerId } },
    });
    if (existing) throw new ConflictException('Already applied');

    let schema: ApplicationForm | null = null;
    if (request.applicationSchema) {
      const parsed = applicationFormSchema.safeParse(request.applicationSchema);
      if (parsed.success) schema = parsed.data;
    }
    const validated = validateAnswers(schema, input.answers ?? {});
    if (!validated.ok) {
      throw new BadRequestException({
        message: 'Invalid answers',
        fieldErrors: validated.errors,
      });
    }

    const created = await this.prisma.application.create({
      data: {
        requestId: input.requestId,
        trainerId,
        coverLetter: input.coverLetter,
        proposedRate: input.proposedRate,
        proposedTimelineDays: input.proposedTimelineDays,
        answers: validated.answers as Prisma.InputJsonValue,
      },
    });

    const withCompany = await this.prisma.jobRequest.findUnique({
      where: { id: input.requestId },
      select: {
        slug: true,
        title: true,
        company: { select: { ownerId: true } },
      },
    });
    const trainerUser = await this.prisma.user.findUnique({
      where: { id: trainerId },
      select: { name: true },
    });
    if (withCompany?.company.ownerId) {
      await this.notifications.emit({
        userId: withCompany.company.ownerId,
        type: 'application.received',
        payload: {
          title: `New application on "${withCompany.title}"`,
          body: `${trainerUser?.name ?? 'A trainer'} applied to your request.`,
          href: `/company/requests/${withCompany.slug}/applications/${created.id}`,
          meta: { applicationId: created.id, requestSlug: withCompany.slug },
        },
      });
    }
    return created;
  }

  async updateStatus(
    ownerId: string,
    applicationId: string,
    status: ApplicationStatus,
    note: string | undefined,
    ctx: StatusUpdateContext = {},
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your application');
    }

    const fromStatus = app.status;
    const toStatus = status;

    // These targets have dedicated endpoints that enforce extra invariants
    // (test must exist, belong to the same request, have tasks; submit must
    // come with an attempt + responses). Reaching them through the generic
    // PATCH would skip those checks and the assignment email.
    const RESTRICTED_TARGETS: readonly ApplicationStatus[] = ['TEST_ASSIGNED', 'TEST_SUBMITTED'];
    if (RESTRICTED_TARGETS.includes(toStatus)) {
      throw new BadRequestException(
        toStatus === 'TEST_ASSIGNED'
          ? 'Use POST /applications/:id/assign-test to assign a test'
          : 'TEST_SUBMITTED is set by the trainer via POST /tests/attempts/:id/submit',
      );
    }

    if (!canTransitionApplicationStatus(fromStatus, toStatus)) {
      const allowed = APPLICATION_STATUS_TRANSITIONS[fromStatus];
      throw new BadRequestException(
        allowed.length === 0
          ? `Application is in terminal state ${fromStatus}`
          : `Invalid transition ${fromStatus} → ${toStatus}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic claim: only proceed if the row is still at `fromStatus`.
      // Prevents lost updates when two concurrent PATCHes race.
      const claim = await tx.application.updateMany({
        where: { id: applicationId, status: fromStatus },
        data: { status: toStatus },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Application status changed concurrently, please reload');
      }

      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
          entityType: 'Application',
          entityId: applicationId,
          ip: ctx.ip ?? null,
          diff: {
            fromStatus,
            toStatus,
            note: note ?? null,
            userAgent: ctx.userAgent ?? null,
            locale: ctx.locale ?? null,
          },
        },
      });

      return tx.application.findUniqueOrThrow({ where: { id: applicationId } });
    }).then(async (updated) => {
      await this.notifyTrainerOfStatus(app.trainerId, updated.id, toStatus, app.request.title, app.request.slug);
      return updated;
    });
  }

  private async notifyTrainerOfStatus(
    trainerUserId: string,
    applicationId: string,
    status: ApplicationStatus,
    requestTitle: string,
    requestSlug: string,
  ) {
    const typeMap: Partial<Record<ApplicationStatus, 'application.shortlisted' | 'application.accepted' | 'application.rejected'>> = {
      SHORTLISTED: 'application.shortlisted',
      ACCEPTED: 'application.accepted',
      REJECTED: 'application.rejected',
    };
    const t = typeMap[status];
    if (!t) return;
    const titles = {
      'application.shortlisted': `Shortlisted for "${requestTitle}"`,
      'application.accepted': `You were accepted for "${requestTitle}"`,
      'application.rejected': `Application not selected: "${requestTitle}"`,
    } as const;
    await this.notifications.emit({
      userId: trainerUserId,
      type: t,
      payload: {
        title: titles[t],
        href: `/trainer/applications/${applicationId}`,
        meta: { applicationId, requestSlug, status },
      },
      email:
        t === 'application.accepted' || t === 'application.rejected'
          ? {
              subject: titles[t],
              html: `<p>${titles[t]}.</p><p>Open the request on Trainova AI to see details.</p>`,
            }
          : null,
    });
  }

  async assignTest(
    ownerId: string,
    applicationId: string,
    testId: string,
    ctx: StatusUpdateContext = {},
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.request.company.ownerId !== ownerId) {
      throw new ForbiddenException('Not your application');
    }

    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: {
        id: true,
        requestId: true,
        tasks: { select: { id: true } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    if (test.requestId !== app.requestId) {
      throw new BadRequestException('Test does not belong to this application request');
    }
    if (test.tasks.length === 0) {
      throw new BadRequestException('Test has no tasks — add tasks before assigning');
    }

    const fromStatus = app.status;
    const toStatus: ApplicationStatus = 'TEST_ASSIGNED';
    if (!canTransitionApplicationStatus(fromStatus, toStatus)) {
      throw new BadRequestException(
        `Cannot assign a test from status ${fromStatus} — application must be APPLIED or SHORTLISTED`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.application.updateMany({
        where: { id: applicationId, status: fromStatus },
        data: { status: toStatus },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Application status changed concurrently, please reload');
      }

      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
          entityType: 'Application',
          entityId: applicationId,
          ip: ctx.ip ?? null,
          diff: {
            fromStatus,
            toStatus,
            testId,
            userAgent: ctx.userAgent ?? null,
            locale: ctx.locale ?? null,
          },
        },
      });
    });

    // Send the email outside the transaction so a provider hiccup doesn't
    // roll back the status change. Failures are logged but not fatal.
    try {
      await this.tests.sendAssignmentEmail(applicationId, testId);
    } catch {
      /* swallow — status change is authoritative */
    }

    await this.notifications.emit({
      userId: app.trainerId,
      type: 'test.assigned',
      payload: {
        title: `Test assigned for "${app.request.title}"`,
        body: 'Open your application to start the evaluation.',
        href: `/trainer/applications/${applicationId}/test`,
        meta: { applicationId, testId, requestSlug: app.request.slug },
      },
    });

    return this.prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  }

  async history(userId: string, applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { request: { include: { company: { select: { ownerId: true } } } } },
    });
    if (!app) throw new NotFoundException('Application not found');

    const isOwner = app.request.company.ownerId === userId;
    const isTrainer = app.trainerId === userId;
    if (!isOwner && !isTrainer) {
      throw new ForbiddenException('Not allowed to view this history');
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'Application',
        entityId: applicationId,
        action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
      },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true } } },
    });

    return rows.map((row) => {
      const diff = (row.diff ?? {}) as {
        fromStatus?: string;
        toStatus?: string;
        note?: string | null;
        locale?: string | null;
      };
      return {
        id: row.id,
        action: row.action,
        fromStatus: diff.fromStatus ?? null,
        toStatus: diff.toStatus ?? null,
        note: diff.note ?? null,
        locale: diff.locale ?? null,
        actorId: row.actorId,
        actorName: row.actor?.name ?? null,
        createdAt: row.createdAt,
      };
    });
  }
}
