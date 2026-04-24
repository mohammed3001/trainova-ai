import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@trainova/shared';
import type {
  AdminListReportsQuery,
  CreateReportInput,
  ReviewReportInput,
} from '@trainova/shared';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminContext } from './admin.service';

/**
 * Reports = user-submitted moderation flags against any target
 * (message, conversation, trainer, company, request, etc.). Admin reviews
 * them and records a resolution (NO_ACTION / WARNING_ISSUED / CONTENT_REMOVED
 * / USER_SUSPENDED / USER_BANNED / ESCALATED). The moderation queue is the
 * primary entry point for the admin to act on abuse signals.
 */
@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private clampLimit(v: number | undefined, fallback = 50): number {
    const n = Number.isFinite(v) ? Math.floor(v as number) : fallback;
    if (n < 1) return 1;
    if (n > 100) return 100;
    return n;
  }

  // Create — called by any authenticated user.
  async submit(reporterId: string, ip: string | null, body: CreateReportInput) {
    if (body.reason.trim().length < 5) {
      throw new BadRequestException('Reason is too short');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          reporterId,
          targetType: body.targetType,
          targetId: body.targetId,
          category: body.category,
          reason: body.reason.trim(),
          evidenceUrls: body.evidenceUrls ?? [],
        },
        select: {
          id: true,
          status: true,
          targetType: true,
          targetId: true,
          category: true,
          createdAt: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: reporterId,
          action: AUDIT_ACTIONS.REPORT_SUBMITTED,
          entityType: 'Report',
          entityId: report.id,
          ip,
          diff: { targetType: body.targetType, targetId: body.targetId, category: body.category },
        },
      });
      return report;
    });
    return row;
  }

  async listMine(reporterId: string, limit = 50, cursor?: string) {
    const take = this.clampLimit(limit);
    const rows = await this.prisma.report.findMany({
      where: { reporterId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        targetType: true,
        targetId: true,
        category: true,
        status: true,
        resolution: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  // --- Admin side ---

  async listForAdmin(query: AdminListReportsQuery) {
    const take = this.clampLimit(query.limit);
    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.targetType) where.targetType = query.targetType;
    if (query.category) where.category = query.category;
    if (query.reporterId) where.reporterId = query.reporterId;
    const rows = await this.prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        targetType: true,
        targetId: true,
        category: true,
        status: true,
        resolution: true,
        createdAt: true,
        resolvedAt: true,
        reporter: { select: { id: true, name: true, email: true } },
        resolver: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getForAdmin(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, name: true, email: true, role: true } },
        resolver: { select: { id: true, name: true, email: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    const target = await this.fetchTarget(report.targetType, report.targetId);
    return { ...report, target };
  }

  private async fetchTarget(type: string, id: string): Promise<unknown> {
    switch (type) {
      case 'USER':
        return this.prisma.user.findUnique({
          where: { id },
          select: { id: true, name: true, email: true, role: true, status: true },
        });
      case 'COMPANY':
        return this.prisma.company.findUnique({
          where: { id },
          select: { id: true, name: true, slug: true, verified: true },
        });
      case 'TRAINER':
        return this.prisma.trainerProfile.findUnique({
          where: { id },
          select: {
            id: true,
            slug: true,
            headline: true,
            verified: true,
            user: { select: { id: true, name: true, email: true } },
          },
        });
      case 'REQUEST':
        return this.prisma.jobRequest.findUnique({
          where: { id },
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        });
      case 'APPLICATION':
        return this.prisma.application.findUnique({
          where: { id },
          select: {
            id: true,
            status: true,
            trainer: { select: { id: true, name: true, email: true } },
            request: { select: { id: true, slug: true, title: true } },
          },
        });
      case 'MESSAGE':
        return this.prisma.message.findUnique({
          where: { id },
          select: {
            id: true,
            body: true,
            redactedAt: true,
            createdAt: true,
            conversationId: true,
            sender: { select: { id: true, name: true, email: true } },
          },
        });
      case 'CONVERSATION':
        return this.prisma.conversation.findUnique({
          where: { id },
          select: {
            id: true,
            lockedAt: true,
            createdAt: true,
            request: { select: { id: true, slug: true, title: true } },
          },
        });
      case 'REVIEW':
        return this.prisma.review.findUnique({
          where: { id },
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            author: { select: { id: true, name: true } },
            target: { select: { id: true, name: true } },
          },
        });
      case 'TEST':
        return this.prisma.test.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            description: true,
            request: {
              select: {
                id: true,
                slug: true,
                title: true,
                company: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        });
      case 'OTHER':
      default:
        return null;
    }
  }

  async review(ctx: AdminContext, id: string, body: ReviewReportInput) {
    // Atomic claim: only a PENDING/OPEN/INVESTIGATING report may transition.
    const current = await this.prisma.report.findUnique({
      where: { id },
      select: { id: true, status: true, resolution: true },
    });
    if (!current) throw new NotFoundException('Report not found');
    if (current.status === 'RESOLVED' || current.status === 'DISMISSED') {
      throw new BadRequestException('Report already closed');
    }
    const terminal = body.status === 'RESOLVED' || body.status === 'DISMISSED';
    if (terminal && !body.resolution) {
      throw new BadRequestException('Resolution required when closing a report');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.report.update({
        where: { id },
        data: {
          status: body.status,
          resolution: body.resolution ?? null,
          resolverNotes: body.resolverNotes ?? null,
          resolverId: terminal ? ctx.actorId : null,
          resolvedAt: terminal ? new Date() : null,
        },
        select: {
          id: true,
          status: true,
          resolution: true,
          resolvedAt: true,
          resolverNotes: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: terminal
            ? AUDIT_ACTIONS.ADMIN_REPORT_RESOLVED
            : AUDIT_ACTIONS.ADMIN_REPORT_STATUS_CHANGED,
          entityType: 'Report',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: {
            from: { status: current.status, resolution: current.resolution },
            to: { status: body.status, resolution: body.resolution ?? null },
          },
        },
      });
      return updated;
    });
  }
}
