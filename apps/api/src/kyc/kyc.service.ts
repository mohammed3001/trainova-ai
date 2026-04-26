import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type KycSession, type KycSessionStatus } from '@trainova/db';
import {
  AUDIT_ACTIONS,
  type AdminListKycQuery,
  type KycProvider,
  type ReviewKycInput,
  type StartKycInput,
  type SubmitKycInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { KYC_PROVIDER } from './providers/stub-kyc.provider';

const ACTIVE_STATUSES: KycSessionStatus[] = ['PENDING', 'AWAITING_REVIEW'];

function clampLimit(limit: number | undefined): number {
  const n = Number.isFinite(limit) ? Math.floor(limit as number) : 50;
  if (n < 1) return 1;
  if (n > 100) return 100;
  return n;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
  ) {}

  // ---------------------------------------------------------------------------
  // Subject side (the user being verified)
  // ---------------------------------------------------------------------------

  /**
   * Start a fresh session, or return the existing active one. Idempotent on
   * the (userId, ACTIVE) tuple so a double-click in the UI doesn't open two
   * provider sessions and burn quota.
   *
   * Concurrency: the entire (re-check active + provider createSession + insert)
   * sequence runs inside a single transaction guarded by a per-user advisory
   * lock. Two concurrent requests for the same user serialize on the lock; the
   * second one observes the active session created by the first and returns it
   * without calling the provider.
   */
  async startOrResume(userId: string, input: StartKycInput, ip: string | null): Promise<KycSession> {
    // Cheap pre-check outside the transaction so the common already-verified
    // case doesn't grab the advisory lock at all.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.kycVerifiedAt) {
      throw new BadRequestException('Identity already verified');
    }

    return this.prisma.$transaction(async (tx) => {
      // pg_advisory_xact_lock takes a bigint key and is released automatically
      // on transaction commit/rollback. hashtextextended is a stable 64-bit
      // hash of the userId so two concurrent requests for the same user
      // serialize, while different users never block each other.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;

      // Re-read inside the lock so we don't act on stale data.
      const verified = await tx.user.findUnique({
        where: { id: userId },
        select: { kycVerifiedAt: true },
      });
      if (verified?.kycVerifiedAt) {
        throw new BadRequestException('Identity already verified');
      }

      const active = await tx.kycSession.findFirst({
        where: { userId, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });
      if (active) return active;

      // Only one tx per user reaches the provider — no quota burn under contention.
      const remote = await this.provider.createSession({ ...input, userId });
      const session = await tx.kycSession.create({
        data: {
          userId,
          provider: this.provider.name,
          providerSessionId: remote.providerSessionId,
          status: 'PENDING',
          documentType: input.documentType,
          documentCountry: input.documentCountry,
          expiresAt: remote.expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AUDIT_ACTIONS.KYC_SESSION_STARTED,
          entityType: 'KycSession',
          entityId: session.id,
          ip,
          diff: { provider: this.provider.name, documentType: input.documentType },
        },
      });
      return session;
    });
  }

  /**
   * Mark the active session as ready for review. Pushes the documents to the
   * provider and either lands at AWAITING_REVIEW (real providers) or moves
   * straight to APPROVED/REJECTED (synchronous stub / Stripe Identity).
   */
  async submitDocuments(
    userId: string,
    input: SubmitKycInput,
    ip: string | null,
  ): Promise<KycSession> {
    const session = await this.prisma.kycSession.findFirst({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) {
      throw new BadRequestException('No active KYC session — start one first');
    }
    if (session.status !== 'PENDING') {
      throw new BadRequestException('Session already submitted for review');
    }
    if (!session.providerSessionId) {
      throw new BadRequestException('Session is missing a provider id — restart');
    }

    const decision = await this.provider.submitDocuments({
      providerSessionId: session.providerSessionId,
      documents: input.documents,
    });

    return this.prisma.$transaction(async (tx) => {
      const documentsJson = input.documents as unknown as Prisma.JsonArray;
      const baseUpdate = {
        documents: documentsJson,
        submittedAt: new Date(),
      };

      if (decision.status === 'APPROVED') {
        const updated = await tx.kycSession.update({
          where: { id: session.id },
          data: {
            ...baseUpdate,
            status: 'APPROVED',
            decisionReason: decision.reason,
            reviewedAt: new Date(),
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { kycVerifiedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: AUDIT_ACTIONS.KYC_SESSION_APPROVED,
            entityType: 'KycSession',
            entityId: session.id,
            ip,
            diff: { provider: this.provider.name, auto: true },
          },
        });
        return updated;
      }

      if (decision.status === 'REJECTED') {
        const updated = await tx.kycSession.update({
          where: { id: session.id },
          data: {
            ...baseUpdate,
            status: 'REJECTED',
            decisionReason: decision.reason,
            reviewedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: AUDIT_ACTIONS.KYC_SESSION_REJECTED,
            entityType: 'KycSession',
            entityId: session.id,
            ip,
            diff: {
              provider: this.provider.name,
              auto: true,
              reason: decision.reason ?? null,
            },
          },
        });
        return updated;
      }

      const updated = await tx.kycSession.update({
        where: { id: session.id },
        data: {
          ...baseUpdate,
          status: 'AWAITING_REVIEW',
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AUDIT_ACTIONS.KYC_SESSION_SUBMITTED,
          entityType: 'KycSession',
          entityId: session.id,
          ip,
          diff: { provider: this.provider.name, documentCount: input.documents.length },
        },
      });
      return updated;
    });
  }

  /**
   * The subject's view of their own status. Returns the most recent session
   * (any status) so the UI can render "rejected on …" history without a
   * separate query.
   */
  async getMine(userId: string) {
    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { kycVerifiedAt: true },
      }),
      this.prisma.kycSession.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: this.SUBJECT_SELECT,
      }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    return {
      kycVerifiedAt: user.kycVerifiedAt,
      session,
    };
  }

  // ---------------------------------------------------------------------------
  // Admin side
  // ---------------------------------------------------------------------------

  async listForAdmin(query: AdminListKycQuery) {
    const take = clampLimit(query.limit);
    const where: Prisma.KycSessionWhereInput = {};
    if (query.status) where.status = query.status;

    const rows = await this.prisma.kycSession.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      select: this.ADMIN_LIST_SELECT,
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
    };
  }

  async getOneForAdmin(id: string) {
    const row = await this.prisma.kycSession.findUnique({
      where: { id },
      select: this.ADMIN_DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('KYC session not found');
    return row;
  }

  async review(adminUserId: string, id: string, input: ReviewKycInput, ip: string | null) {
    const session = await this.prisma.kycSession.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!session) throw new NotFoundException('KYC session not found');
    if (session.status !== 'AWAITING_REVIEW') {
      throw new BadRequestException(
        `Session is in ${session.status}; only AWAITING_REVIEW can be decided`,
      );
    }
    if (input.decision === 'REJECT' && !input.decisionReason?.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.kycSession.update({
        where: { id },
        data: {
          status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewedAt: now,
          reviewerId: adminUserId,
          decisionReason: input.decisionReason ?? null,
        },
      });
      if (input.decision === 'APPROVE') {
        await tx.user.update({
          where: { id: session.userId },
          data: { kycVerifiedAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: adminUserId,
          action:
            input.decision === 'APPROVE'
              ? AUDIT_ACTIONS.KYC_SESSION_APPROVED
              : AUDIT_ACTIONS.KYC_SESSION_REJECTED,
          entityType: 'KycSession',
          entityId: id,
          ip,
          diff: {
            decision: input.decision,
            reason: input.decisionReason ?? null,
            subjectUserId: session.userId,
          },
        },
      });
      return updated;
    });
  }

  /**
   * Admin override — strips the verified flag without rejecting the original
   * session row (preserves audit trail). The subject can then start a fresh
   * session.
   */
  async revokeVerification(adminUserId: string, subjectUserId: string, reason: string, ip: string | null) {
    const subject = await this.prisma.user.findUnique({
      where: { id: subjectUserId },
      select: { id: true, kycVerifiedAt: true },
    });
    if (!subject) throw new NotFoundException('User not found');
    if (!subject.kycVerifiedAt) {
      throw new BadRequestException('User is not currently verified');
    }
    if (!reason.trim()) {
      throw new ForbiddenException('A revocation reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: subjectUserId },
        data: { kycVerifiedAt: null },
        select: { id: true, kycVerifiedAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminUserId,
          action: AUDIT_ACTIONS.KYC_VERIFICATION_REVOKED,
          entityType: 'User',
          entityId: subjectUserId,
          ip,
          diff: { reason },
        },
      });
      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Selects
  //
  // KYC documents reference S3 keys — they're sensitive identity data. The
  // subject sees their own; admins see everything; nobody else gets a path
  // to read these rows from anywhere in the API.
  // ---------------------------------------------------------------------------

  private readonly SUBJECT_SELECT = {
    id: true,
    status: true,
    provider: true,
    documentType: true,
    documentCountry: true,
    submittedAt: true,
    reviewedAt: true,
    decisionReason: true,
    expiresAt: true,
    createdAt: true,
  } satisfies Prisma.KycSessionSelect;

  private readonly ADMIN_LIST_SELECT = {
    id: true,
    status: true,
    provider: true,
    documentType: true,
    documentCountry: true,
    submittedAt: true,
    reviewedAt: true,
    createdAt: true,
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        kycVerifiedAt: true,
      },
    },
  } satisfies Prisma.KycSessionSelect;

  private readonly ADMIN_DETAIL_SELECT = {
    ...this.ADMIN_LIST_SELECT,
    documents: true,
    decisionReason: true,
    metadata: true,
    expiresAt: true,
    providerSessionId: true,
    reviewer: {
      select: { id: true, name: true, email: true },
    },
  } satisfies Prisma.KycSessionSelect;
}
