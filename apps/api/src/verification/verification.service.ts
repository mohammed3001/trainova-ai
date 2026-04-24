import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@trainova/shared';
import type {
  SubmitVerificationInput,
  AdminListVerificationQuery,
  ReviewVerificationInput,
  UserRole,
} from '@trainova/shared';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';

export interface RequestCtx {
  userId: string;
  role: UserRole;
  ip?: string | null;
}

function clampLimit(limit: number | undefined): number {
  const n = Number.isFinite(limit) ? Math.floor(limit as number) : 50;
  if (n < 1) return 1;
  if (n > 100) return 100;
  return n;
}

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Submitter side (trainer / company owner)
  // ---------------------------------------------------------------------------

  async submit(ctx: RequestCtx, input: SubmitVerificationInput) {
    if (input.targetType === 'COMPANY' && ctx.role !== 'COMPANY_OWNER') {
      throw new ForbiddenException('Only company owners may submit company verification');
    }
    if (input.targetType === 'TRAINER' && ctx.role !== 'TRAINER') {
      throw new ForbiddenException('Only trainers may submit trainer verification');
    }

    let targetId: string;
    if (input.targetType === 'COMPANY') {
      const company = await this.prisma.company.findUnique({
        where: { ownerId: ctx.userId },
        select: { id: true, verified: true },
      });
      if (!company) throw new BadRequestException('No company profile to verify');
      if (company.verified) throw new BadRequestException('Company already verified');
      targetId = company.id;
    } else {
      const trainer = await this.prisma.trainerProfile.findUnique({
        where: { userId: ctx.userId },
        select: { id: true, verified: true },
      });
      if (!trainer) throw new BadRequestException('No trainer profile to verify');
      if (trainer.verified) throw new BadRequestException('Trainer already verified');
      targetId = trainer.id;
    }

    // Uniqueness of a single PENDING row per (submitter, targetType, targetId)
    // is enforced by a partial unique index on VerificationRequest (see
    // 20260425000000_t5a_verification migration). We do a cheap pre-check
    // to return a friendly error on the common path, and still catch P2002
    // on the race where two concurrent submits pass the pre-check.
    const pending = await this.prisma.verificationRequest.findFirst({
      where: { submitterId: ctx.userId, targetType: input.targetType, targetId, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) throw new BadRequestException('A pending verification already exists');

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const v = await tx.verificationRequest.create({
          data: {
            submitterId: ctx.userId,
            targetType: input.targetType,
            targetId,
            status: 'PENDING',
            documents: input.documents as unknown as Prisma.JsonArray,
            notes: input.notes ?? null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: ctx.userId,
            action: AUDIT_ACTIONS.VERIFICATION_REQUESTED,
            entityType: 'VerificationRequest',
            entityId: v.id,
            ip: ctx.ip ?? null,
            diff: { targetType: input.targetType, targetId, documentCount: input.documents.length },
          },
        });
        return v;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('A pending verification already exists');
      }
      throw err;
    }
    return created;
  }

  listMine(ctx: RequestCtx) {
    return this.prisma.verificationRequest.findMany({
      where: { submitterId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        targetType: true,
        status: true,
        documents: true,
        notes: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Admin side
  // ---------------------------------------------------------------------------

  async listForAdmin(query: AdminListVerificationQuery) {
    const take = clampLimit(query.limit);
    const where: Prisma.VerificationRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.targetType) where.targetType = query.targetType;

    const rows = await this.prisma.verificationRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        targetType: true,
        targetId: true,
        status: true,
        documents: true,
        notes: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
        submitter: { select: { id: true, email: true, name: true, role: true } },
        reviewer: { select: { id: true, email: true, name: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getForAdmin(id: string) {
    const row = await this.prisma.verificationRequest.findUnique({
      where: { id },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        status: true,
        documents: true,
        notes: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
        submitter: { select: { id: true, email: true, name: true, role: true } },
        reviewer: { select: { id: true, email: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException('Verification request not found');

    // Enrich with target for reviewer context.
    let target:
      | { kind: 'COMPANY'; id: string; name: string; slug: string; verified: boolean }
      | { kind: 'TRAINER'; id: string; slug: string; headline: string | null; verified: boolean }
      | null = null;
    if (row.targetType === 'COMPANY') {
      const c = await this.prisma.company.findUnique({
        where: { id: row.targetId },
        select: { id: true, name: true, slug: true, verified: true },
      });
      if (c) target = { kind: 'COMPANY', ...c };
    } else {
      const t = await this.prisma.trainerProfile.findUnique({
        where: { id: row.targetId },
        select: { id: true, slug: true, headline: true, verified: true },
      });
      if (t) target = { kind: 'TRAINER', ...t };
    }
    return { ...row, target };
  }

  async review(ctx: RequestCtx, id: string, input: ReviewVerificationInput) {
    const row = await this.prisma.verificationRequest.findUnique({
      where: { id },
      select: { id: true, status: true, targetType: true, targetId: true },
    });
    if (!row) throw new NotFoundException('Verification request not found');
    if (row.status !== 'PENDING') throw new BadRequestException('Already reviewed');
    if (input.decision === 'REJECT' && !(input.rejectionReason ?? '').trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Claim the row — prevent concurrent double-review.
      const claim = await tx.verificationRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewerId: ctx.userId,
          reviewedAt: now,
          rejectionReason: input.decision === 'REJECT' ? (input.rejectionReason ?? null) : null,
        },
      });
      if (claim.count === 0) throw new BadRequestException('Already reviewed');

      // Flip target verified flag on approve.
      if (input.decision === 'APPROVE') {
        if (row.targetType === 'COMPANY') {
          await tx.company.update({ where: { id: row.targetId }, data: { verified: true } });
        } else {
          await tx.trainerProfile.update({ where: { id: row.targetId }, data: { verified: true } });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: ctx.userId,
          action:
            input.decision === 'APPROVE'
              ? AUDIT_ACTIONS.VERIFICATION_APPROVED
              : AUDIT_ACTIONS.VERIFICATION_REJECTED,
          entityType: 'VerificationRequest',
          entityId: id,
          ip: ctx.ip ?? null,
          diff: {
            targetType: row.targetType,
            targetId: row.targetId,
            rejectionReason: input.decision === 'REJECT' ? (input.rejectionReason ?? null) : null,
          },
        },
      });

      return tx.verificationRequest.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          reviewedAt: true,
          rejectionReason: true,
        },
      });
    });
  }
}
