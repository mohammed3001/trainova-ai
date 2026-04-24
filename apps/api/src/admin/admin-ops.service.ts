import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_ACTIONS } from '@trainova/shared';
import type {
  AdminListAttemptsQuery,
  AdminListConversationsQuery,
  AdminListRequestsQuery,
  AdminListTestsQuery,
  JobRequestStatus,
} from '@trainova/shared';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminContext } from './admin.service';

/**
 * Service layer for T5.B admin operations: job requests, tests, chat
 * moderation and analytics. Kept separate from the T5.A `AdminService`
 * (users/companies/trainers/verification) to keep each module under a few
 * hundred lines — the public `AdminController` composes both.
 *
 * All mutations are transactional with an `AuditLog` row for traceability.
 */
@Injectable()
export class AdminOpsService {
  constructor(private readonly prisma: PrismaService) {}

  private clampLimit(v: number | undefined, fallback = 50): number {
    const n = Number.isFinite(v) ? Math.floor(v as number) : fallback;
    if (n < 1) return 1;
    if (n > 100) return 100;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Job requests
  // ---------------------------------------------------------------------------

  async listRequests(query: AdminListRequestsQuery) {
    const take = this.clampLimit(query.limit);
    const where: Prisma.JobRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.companyId) where.companyId = query.companyId;
    if (query.featured !== undefined) where.featured = query.featured;
    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.jobRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        featured: true,
        publishedAt: true,
        closedAt: true,
        createdAt: true,
        workType: true,
        currency: true,
        budgetMin: true,
        budgetMax: true,
        company: { select: { id: true, name: true, slug: true, verified: true } },
        _count: { select: { applications: true, tests: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getRequest(id: string) {
    const req = await this.prisma.jobRequest.findUnique({
      where: { id },
      include: {
        company: {
          select: { id: true, name: true, slug: true, verified: true, ownerId: true },
        },
        skills: { include: { skill: true } },
        _count: {
          select: { applications: true, tests: true, conversations: true, questions: true },
        },
      },
    });
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }

  async setRequestStatus(
    ctx: AdminContext,
    id: string,
    status: JobRequestStatus,
    reason?: string,
  ) {
    const current = await this.prisma.jobRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException('Request not found');
    if (current.status === status) return { id, status };

    return this.prisma.$transaction(async (tx) => {
      const patch: Prisma.JobRequestUpdateInput = { status };
      if (status === 'OPEN' && current.status === 'DRAFT') patch.publishedAt = new Date();
      if (status === 'CLOSED' || status === 'ARCHIVED') {
        patch.closedAt = new Date();
      } else {
        // Reopening from CLOSED / ARCHIVED must clear closedAt so the UI
        // doesn't show a stale "Closed: <date>" next to an OPEN badge.
        patch.closedAt = null;
      }
      const updated = await tx.jobRequest.update({
        where: { id },
        data: patch,
        select: { id: true, status: true, publishedAt: true, closedAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.ADMIN_REQUEST_STATUS_CHANGED,
          entityType: 'JobRequest',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: { from: current.status, to: status, reason: reason ?? null },
        },
      });
      return updated;
    });
  }

  async setRequestFeatured(ctx: AdminContext, id: string, featured: boolean) {
    const current = await this.prisma.jobRequest.findUnique({
      where: { id },
      select: { id: true, featured: true },
    });
    if (!current) throw new NotFoundException('Request not found');
    if (current.featured === featured) return { id, featured };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.jobRequest.update({
        where: { id },
        data: { featured },
        select: { id: true, featured: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: featured
            ? AUDIT_ACTIONS.ADMIN_REQUEST_FEATURED
            : AUDIT_ACTIONS.ADMIN_REQUEST_UNFEATURED,
          entityType: 'JobRequest',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: { from: current.featured, to: featured },
        },
      });
      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  async listTests(query: AdminListTestsQuery) {
    const take = this.clampLimit(query.limit);
    const where: Prisma.TestWhereInput = {};
    if (query.requestId) where.requestId = query.requestId;
    if (query.scoringMode) where.scoringMode = query.scoringMode;
    if (query.companyId) where.request = { companyId: query.companyId };
    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.test.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        scoringMode: true,
        passingScore: true,
        timeLimitMin: true,
        createdAt: true,
        request: {
          select: {
            id: true,
            slug: true,
            title: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { tasks: true, attempts: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getTest(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { order: 'asc' } },
        request: {
          select: {
            id: true,
            slug: true,
            title: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { attempts: true } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    const aggregates = await this.prisma.testAttempt.groupBy({
      by: ['status'],
      where: { testId: id },
      _count: { _all: true },
      _avg: { totalScore: true },
    });
    const statusBreakdown = aggregates.reduce<
      Record<string, { count: number; avgScore: number | null }>
    >((acc, row) => {
      acc[row.status] = {
        count: row._count._all,
        avgScore: row._avg.totalScore ?? null,
      };
      return acc;
    }, {});
    return { ...test, statusBreakdown };
  }

  async listAttempts(query: AdminListAttemptsQuery) {
    const take = this.clampLimit(query.limit);
    const where: Prisma.TestAttemptWhereInput = {};
    if (query.testId) where.testId = query.testId;
    if (query.trainerId) where.trainerId = query.trainerId;
    if (query.status) where.status = query.status;
    const rows = await this.prisma.testAttempt.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        totalScore: true,
        submittedAt: true,
        createdAt: true,
        durationSec: true,
        test: { select: { id: true, title: true, passingScore: true } },
        application: {
          select: {
            id: true,
            trainer: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getAttempt(id: string) {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id },
      include: {
        test: { include: { tasks: { orderBy: { order: 'asc' } } } },
        responses: true,
        application: {
          select: {
            id: true,
            status: true,
            trainer: { select: { id: true, name: true, email: true } },
            request: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }

  // ---------------------------------------------------------------------------
  // Conversations + messages (moderation)
  // ---------------------------------------------------------------------------

  async listConversations(query: AdminListConversationsQuery) {
    const take = this.clampLimit(query.limit);
    const where: Prisma.ConversationWhereInput = {};
    if (query.lockedOnly) where.lockedAt = { not: null };
    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.participants = {
        some: {
          user: {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      };
    }
    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        lockedAt: true,
        lockReason: true,
        createdAt: true,
        updatedAt: true,
        request: { select: { id: true, slug: true, title: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        _count: { select: { messages: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getConversation(id: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        request: {
          select: {
            id: true,
            slug: true,
            title: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, status: true } },
          },
        },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const messages = await this.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        body: true,
        type: true,
        redactedAt: true,
        redactedById: true,
        redactReason: true,
        createdAt: true,
        sender: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return { ...conv, messages };
  }

  async setConversationLocked(
    ctx: AdminContext,
    id: string,
    locked: boolean,
    reason?: string,
  ) {
    const current = await this.prisma.conversation.findUnique({
      where: { id },
      select: { id: true, lockedAt: true },
    });
    if (!current) throw new NotFoundException('Conversation not found');
    if (locked && current.lockedAt) return { id, lockedAt: current.lockedAt };
    if (!locked && !current.lockedAt) return { id, lockedAt: null };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.conversation.update({
        where: { id },
        data: locked
          ? { lockedAt: new Date(), lockedById: ctx.actorId, lockReason: reason ?? null }
          : { lockedAt: null, lockedById: null, lockReason: null },
        select: { id: true, lockedAt: true, lockReason: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: locked
            ? AUDIT_ACTIONS.ADMIN_CONVERSATION_LOCKED
            : AUDIT_ACTIONS.ADMIN_CONVERSATION_UNLOCKED,
          entityType: 'Conversation',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: { reason: reason ?? null },
        },
      });
      return updated;
    });
  }

  async redactMessage(ctx: AdminContext, messageId: string, reason: string) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Reason is required');
    }
    const current = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, redactedAt: true },
    });
    if (!current) throw new NotFoundException('Message not found');
    if (current.redactedAt) return { id: messageId, redactedAt: current.redactedAt };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.message.update({
        where: { id: messageId },
        data: {
          redactedAt: new Date(),
          redactedById: ctx.actorId,
          redactReason: reason,
          body: '[redacted by admin]',
        },
        select: { id: true, redactedAt: true, redactReason: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.ADMIN_MESSAGE_REDACTED,
          entityType: 'Message',
          entityId: messageId,
          ip: ctx.ip ?? null,
          diff: { conversationId: current.conversationId, reason },
        },
      });
      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Analytics (simple time-series aggregates)
  // ---------------------------------------------------------------------------

  async analytics(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Buckets by day. Use raw SQL for date_trunc — Prisma doesn't expose it.
    const [signups, requests, applications, attempts, messages, reports] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "User"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1 ASC`,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "JobRequest"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1 ASC`,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "Application"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1 ASC`,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "TestAttempt"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1 ASC`,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "Message"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1 ASC`,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "Report"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1 ASC`,
    ]);

    const toSeries = (rows: Array<{ day: Date; count: bigint }>) =>
      rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count) }));

    const [signupsByRole, requestsByStatus, reportsByStatus] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.jobRequest.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.report.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    return {
      windowDays: days,
      series: {
        signups: toSeries(signups),
        requests: toSeries(requests),
        applications: toSeries(applications),
        attempts: toSeries(attempts),
        messages: toSeries(messages),
        reports: toSeries(reports),
      },
      breakdowns: {
        signupsByRole: signupsByRole.map((r) => ({ role: r.role, count: r._count._all })),
        requestsByStatus: requestsByStatus.map((r) => ({
          status: r.status,
          count: r._count._all,
        })),
        reportsByStatus: reportsByStatus.map((r) => ({
          status: r.status,
          count: r._count._all,
        })),
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
