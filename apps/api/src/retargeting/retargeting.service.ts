import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, type AudienceSegment } from '@trainova/db';
import { createHash, randomBytes } from 'node:crypto';
import {
  RETARGETING_PATH_MAX,
  RETARGETING_UA_MAX,
  retargetingSegmentDefinitionSchema,
  type AudienceSegmentCreateInput,
  type AudienceSegmentDetail,
  type AudienceSegmentSummary,
  type AudienceSegmentUpdateInput,
  type RetargetingEntityKind,
  type RetargetingEventInput,
  type RetargetingEventType,
  type RetargetingSegmentDefinition,
  type RetargetingSegmentRule,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Internal type for the row returned by `prisma.audienceSegment.findUnique`. */
type AudienceSegmentRow = AudienceSegment;

/**
 * T9.G — Retargeting + audience segments.
 *
 * Three responsibilities:
 *
 *  1. **Ingest events** (`recordEvent`). Called from `RetargetingPixelController`
 *     for both the GIF pixel and the JSON event endpoint.
 *  2. **Resolve segment membership at serve time** (`getSegmentIdsForSession`).
 *     Called from `AdsService.serveAds` via the `RETARGETING_SEGMENT_RESOLVER`
 *     dependency injection key so ads can intersect the visitor's segment set
 *     with each campaign's `targetingAudienceSegmentIds`.
 *  3. **Recompute memberships** on a cron (`@Cron` every 15 min). Each active
 *     `AudienceSegment` row's `definition` JSON is parsed back through Zod (so
 *     a corrupt admin save can never crash the recomputer), each rule is
 *     translated into a Prisma WHERE against `RetargetingEvent`, the union of
 *     matching cookieIds/userIds is upserted into `AudienceMembership` with
 *     `expiresAt = now + lookbackDays`.
 */
@Injectable()
export class RetargetingService {
  private readonly logger = new Logger(RetargetingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =====================================================================
  // Cookie helpers
  // =====================================================================

  /**
   * Generates a fresh first-party tracking cookie value. We use the same
   * shape as `cuid()` in length but pull from `randomBytes` directly so
   * the value is unguessable and not tied to any DB primary key.
   */
  static newCookieId(): string {
    return 'rt_' + randomBytes(18).toString('hex');
  }

  /**
   * Hash a raw IP for storage. We never store the IP itself — just a
   * truncated SHA-256. Truncation keeps the hash short enough for the
   * `RetargetingEvent.ipHash` column without losing collision resistance
   * for the moderation / abuse-investigation use case (rotated daily by
   * salting with the UTC date).
   */
  static hashIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    const day = new Date().toISOString().slice(0, 10);
    return createHash('sha256')
      .update(`${day}::${ip}`)
      .digest('hex')
      .slice(0, 32);
  }

  // =====================================================================
  // Event ingestion
  // =====================================================================

  /**
   * Persist a single retargeting event. Returns the cookie id the caller
   * should set on the response (always the same `cookieId` argument; we
   * never rotate inside this method — that's the controller's call).
   *
   * Truncates `path` and `userAgent` defensively so a malicious client
   * can't bloat the events table with multi-KB strings even if the
   * controller forgets to apply Zod's `.max()`.
   */
  async recordEvent(args: {
    cookieId: string;
    userId: string | null;
    input: RetargetingEventInput;
    userAgent: string | null;
    ipHash: string | null;
  }): Promise<void> {
    const { cookieId, userId, input, userAgent, ipHash } = args;
    if (process.env.RETARGETING_INGEST_DISABLED === '1') return;
    await this.prisma.retargetingEvent.create({
      data: {
        cookieId,
        userId,
        eventType: input.eventType,
        path: input.path?.slice(0, RETARGETING_PATH_MAX) ?? null,
        entityKind: input.entityKind ?? null,
        entityId: input.entityId ?? null,
        locale: input.locale ?? null,
        userAgent: userAgent?.slice(0, RETARGETING_UA_MAX) ?? null,
        ipHash,
      },
    });
  }

  // =====================================================================
  // Membership resolution (called from AdsService.serveAds)
  // =====================================================================

  /**
   * Fetch all active segments the supplied session belongs to. Either
   * `cookieId` or `userId` (or both) may be null — when both are null,
   * returns an empty array (anonymous, untracked).
   *
   * Includes the `expiresAt > now` filter at lookup time so a stale
   * membership row left behind by a missed cron pass can't keep someone
   * in a segment forever.
   */
  async getSegmentIdsForSession(
    cookieId: string | null,
    userId: string | null,
  ): Promise<string[]> {
    if (!cookieId && !userId) return [];
    const now = new Date();
    const memberships = await this.prisma.audienceMembership.findMany({
      where: {
        expiresAt: { gt: now },
        // Filter through to the parent segment so a deactivated segment
        // can never drive ad targeting via stale membership rows. Without
        // this guard, a `lookbackDays`-aged membership would keep matching
        // for up to 180 days after the admin flipped `isActive = false`.
        segment: { isActive: true },
        OR: [
          ...(cookieId ? [{ cookieId } as const] : []),
          ...(userId ? [{ userId } as const] : []),
        ],
      },
      select: { segmentId: true },
      take: 200,
    });
    // Dedupe in case a session is matched on both keys.
    return Array.from(new Set(memberships.map((m) => m.segmentId)));
  }

  // =====================================================================
  // Segment CRUD (admin)
  // =====================================================================

  async listSegments(): Promise<AudienceSegmentSummary[]> {
    const rows = await this.prisma.audienceSegment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toSummary);
  }

  async getSegment(id: string): Promise<AudienceSegmentDetail> {
    const row = await this.prisma.audienceSegment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Audience segment not found');
    return toDetail(row);
  }

  async createSegment(
    input: AudienceSegmentCreateInput,
    createdById: string,
  ): Promise<AudienceSegmentDetail> {
    // Re-validate the definition JSON server-side. The DTO already ran
    // through ZodValidationPipe at the controller, but we keep this
    // belt-and-braces check so a future caller that bypasses the pipe
    // (e.g. an internal job) still can't store a malformed definition.
    const def = retargetingSegmentDefinitionSchema.parse(input.definition);
    const slug = input.slug.toLowerCase();
    try {
      const row = await this.prisma.audienceSegment.create({
        data: {
          slug,
          name: input.name,
          description: input.description ?? null,
          lookbackDays: input.lookbackDays,
          isActive: input.isActive ?? true,
          definition: def as unknown as Prisma.InputJsonValue,
          createdById,
        },
      });
      return toDetail(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(`Slug "${slug}" is already in use`);
      }
      throw err;
    }
  }

  async updateSegment(
    id: string,
    input: AudienceSegmentUpdateInput,
  ): Promise<AudienceSegmentDetail> {
    const data: Prisma.AudienceSegmentUpdateInput = {};
    if (input.slug !== undefined) data.slug = input.slug.toLowerCase();
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined)
      data.description = input.description ?? null;
    if (input.lookbackDays !== undefined) data.lookbackDays = input.lookbackDays;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.definition !== undefined) {
      const def = retargetingSegmentDefinitionSchema.parse(input.definition);
      data.definition = def as unknown as Prisma.InputJsonValue;
    }
    try {
      const row = await this.prisma.audienceSegment.update({
        where: { id },
        data,
      });
      return toDetail(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025')
          throw new NotFoundException('Audience segment not found');
        if (err.code === 'P2002')
          throw new ConflictException('Slug is already in use');
      }
      throw err;
    }
  }

  async deleteSegment(id: string): Promise<{ ok: true }> {
    try {
      await this.prisma.audienceSegment.delete({ where: { id } });
      return { ok: true };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('Audience segment not found');
      }
      throw err;
    }
  }

  /**
   * Trigger an immediate recompute pass for a single segment, returning
   * the post-recompute member count. Bypasses the `recomputedAt` recent-
   * pass debounce that the cron uses, so admins can preview a definition
   * change without waiting for the next tick.
   */
  async recomputeSegmentNow(id: string): Promise<{ memberCount: number }> {
    const segment = await this.prisma.audienceSegment.findUnique({
      where: { id },
    });
    if (!segment) throw new NotFoundException('Audience segment not found');
    if (!segment.isActive)
      throw new BadRequestException('Segment is not active');
    const memberCount = await this.recomputeSegment(segment);
    return { memberCount };
  }

  // =====================================================================
  // Cron
  // =====================================================================

  /**
   * Every 10 minutes, recompute all active segments whose last recompute
   * is older than 10 minutes. The 10-minute floor prevents a flapping
   * recomputer from running back-to-back when ticks drift, so each
   * segment is materially refreshed every ~10–20 minutes.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async cron(): Promise<void> {
    if (process.env.RETARGETING_CRON_DISABLED === '1') return;
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const due = await this.prisma.audienceSegment.findMany({
      where: {
        isActive: true,
        OR: [{ recomputedAt: null }, { recomputedAt: { lt: cutoff } }],
      },
      orderBy: { recomputedAt: { sort: 'asc', nulls: 'first' } },
      take: 25,
    });
    for (const segment of due) {
      try {
        await this.recomputeSegment(segment);
      } catch (err) {
        this.logger.error(
          `recompute failed for segment ${segment.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  // =====================================================================
  // Internal: per-segment recompute
  // =====================================================================

  /**
   * Compute (cookieId, userId) → membership for one segment.
   *
   * Strategy:
   *
   *  1. Parse the JSON definition through Zod; on failure log + skip.
   *  2. For each rule, query `RetargetingEvent` with the rule's filter
   *     and group by cookieId / userId, applying `minCount`. Take the
   *     union across rules (logical OR).
   *  3. Compare the union against existing rows in `AudienceMembership`
   *     for this segment. Insert new memberships, refresh `expiresAt` on
   *     surviving ones, delete those no longer matching.
   *  4. Update `recomputedAt` and `memberCount` on the segment row.
   *
   * The whole thing runs in a single Prisma transaction so the segment
   * is atomically swapped — concurrent ad-serve calls either see the
   * old membership set or the new one, never a partial state.
   */
  private async recomputeSegment(segment: AudienceSegmentRow): Promise<number> {
    let definition: RetargetingSegmentDefinition;
    try {
      definition = retargetingSegmentDefinitionSchema.parse(segment.definition);
    } catch (err) {
      this.logger.error(
        `segment ${segment.id} has invalid definition; skipping recompute`,
        err instanceof Error ? err.stack : String(err),
      );
      return segment.memberCount;
    }

    const cookieIds = new Set<string>();
    const userIds = new Set<string>();

    for (const rule of definition.rules) {
      const ruleWindow = Math.min(rule.withinDays, segment.lookbackDays);
      const since = new Date(Date.now() - ruleWindow * 24 * 60 * 60 * 1000);
      const where = buildRuleWhere(rule, since);
      // We query cookieIds and userIds in two separate `groupBy` calls
      // so we can apply `minCount` per-bucket without manual aggregation
      // in JS. Each call is bounded by `take` so a runaway segment can't
      // pull millions of rows into memory.
      const [byCookie, byUser] = await Promise.all([
        this.prisma.retargetingEvent.groupBy({
          by: ['cookieId'],
          where,
          _count: { _all: true },
          having:
            rule.minCount > 1
              ? { cookieId: { _count: { gte: rule.minCount } } }
              : undefined,
          orderBy: { cookieId: 'asc' },
          take: 50_000,
        }),
        this.prisma.retargetingEvent.groupBy({
          by: ['userId'],
          where: { ...where, userId: { not: null } },
          _count: { _all: true },
          having:
            rule.minCount > 1
              ? { userId: { _count: { gte: rule.minCount } } }
              : undefined,
          orderBy: { userId: 'asc' },
          take: 50_000,
        }),
      ]);
      for (const row of byCookie) {
        if (row.cookieId) cookieIds.add(row.cookieId);
      }
      for (const row of byUser) {
        if (row.userId) userIds.add(row.userId);
      }
    }

    const expiresAt = new Date(
      Date.now() + segment.lookbackDays * 24 * 60 * 60 * 1000,
    );
    const memberCount = cookieIds.size + userIds.size;

    await this.prisma.$transaction(async (tx) => {
      // Snapshot of current memberships for diffing.
      const existing = await tx.audienceMembership.findMany({
        where: { segmentId: segment.id },
        select: { id: true, cookieId: true, userId: true },
      });
      const existingCookieIds = new Set(
        existing.filter((e) => e.cookieId).map((e) => e.cookieId as string),
      );
      const existingUserIds = new Set(
        existing.filter((e) => e.userId).map((e) => e.userId as string),
      );

      // Inserts (new keys not currently in the membership table).
      const cookieInserts = Array.from(cookieIds).filter(
        (c) => !existingCookieIds.has(c),
      );
      const userInserts = Array.from(userIds).filter(
        (u) => !existingUserIds.has(u),
      );

      if (cookieInserts.length > 0) {
        await tx.audienceMembership.createMany({
          data: cookieInserts.map((cookieId) => ({
            segmentId: segment.id,
            cookieId,
            userId: null,
            expiresAt,
          })),
          skipDuplicates: true,
        });
      }
      if (userInserts.length > 0) {
        await tx.audienceMembership.createMany({
          data: userInserts.map((userId) => ({
            segmentId: segment.id,
            cookieId: null,
            userId,
            expiresAt,
          })),
          skipDuplicates: true,
        });
      }

      // Refresh `expiresAt` on surviving rows so a still-active member
      // doesn't drop out at the old TTL just because we recomputed.
      if (cookieIds.size > 0) {
        await tx.audienceMembership.updateMany({
          where: {
            segmentId: segment.id,
            cookieId: { in: Array.from(cookieIds) },
          },
          data: { expiresAt },
        });
      }
      if (userIds.size > 0) {
        await tx.audienceMembership.updateMany({
          where: {
            segmentId: segment.id,
            userId: { in: Array.from(userIds) },
          },
          data: { expiresAt },
        });
      }

      // Deletes (keys present in DB but not in the recomputed set).
      const cookieDeletes = Array.from(existingCookieIds).filter(
        (c) => !cookieIds.has(c),
      );
      const userDeletes = Array.from(existingUserIds).filter(
        (u) => !userIds.has(u),
      );
      if (cookieDeletes.length > 0) {
        await tx.audienceMembership.deleteMany({
          where: { segmentId: segment.id, cookieId: { in: cookieDeletes } },
        });
      }
      if (userDeletes.length > 0) {
        await tx.audienceMembership.deleteMany({
          where: { segmentId: segment.id, userId: { in: userDeletes } },
        });
      }

      await tx.audienceSegment.update({
        where: { id: segment.id },
        data: { recomputedAt: new Date(), memberCount },
      });
    });

    return memberCount;
  }
}

// =====================================================================
// Helpers (module-private)
// =====================================================================

function toSummary(row: AudienceSegmentRow): AudienceSegmentSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    lookbackDays: row.lookbackDays,
    isActive: row.isActive,
    recomputedAt: row.recomputedAt?.toISOString() ?? null,
    memberCount: row.memberCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: AudienceSegmentRow): AudienceSegmentDetail {
  // We trust the JSON in the DB to round-trip through Zod cleanly when
  // it was saved through `createSegment` / `updateSegment`. If a future
  // hand-edit ever inserts malformed JSON, `parse` here will throw a
  // 500 — surfaceable to the admin, who can then DELETE the row.
  const definition = retargetingSegmentDefinitionSchema.parse(row.definition);
  return {
    ...toSummary(row),
    definition,
    createdById: row.createdById,
  };
}

function buildRuleWhere(
  rule: RetargetingSegmentRule,
  since: Date,
): Prisma.RetargetingEventWhereInput {
  return {
    eventType: rule.eventType as RetargetingEventType,
    createdAt: { gte: since },
    ...(rule.entityKind
      ? { entityKind: rule.entityKind as RetargetingEntityKind }
      : {}),
    ...(rule.entityId ? { entityId: rule.entityId } : {}),
  };
}
