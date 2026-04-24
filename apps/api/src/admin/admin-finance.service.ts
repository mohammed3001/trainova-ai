import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  FINANCE_AUDIT_ACTIONS,
  type AdminCancelSubscriptionInput,
  type AdminContractDetail,
  type AdminContractRow,
  type AdminContractsQuery,
  type AdminFinanceOverview,
  type AdminPayoutRow,
  type AdminPayoutsQuery,
  type AdminPlanInput,
  type AdminPlanRow,
  type AdminPlanUpdateInput,
  type AdminRefundMilestoneInput,
  type AdminSubscriptionRow,
  type AdminSubscriptionsQuery,
  type ContractStatus,
  type MilestoneStatus,
  type PayoutStatus,
  type PlanAudience,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';

interface AdminActor {
  actorId: string;
  ip?: string | null;
}

@Injectable()
export class AdminFinanceService {
  private readonly logger = new Logger(AdminFinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  // ====================================================================
  // Overview / KPIs
  // ====================================================================

  async overview(): Promise<AdminFinanceOverview> {
    const [
      contractCounts,
      milestoneAggregates,
      payoutAggregates,
      activeSubs,
      releasedMilestones,
      recentContractRows,
      recentPayoutRows,
    ] = await Promise.all([
      this.prisma.contract.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.milestone.groupBy({
        by: ['status'],
        _sum: { amountCents: true },
      }),
      this.prisma.payout.groupBy({
        by: ['status'],
        _sum: { amountCents: true },
      }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.milestone.findMany({
        where: { status: 'RELEASED' },
        select: {
          amountCents: true,
          releasedAt: true,
          contract: { select: { platformFeeBps: true } },
        },
      }),
      this.prisma.contract.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: this.contractInclude(),
      }),
      this.prisma.payout.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: this.payoutInclude(),
      }),
    ]);

    const contractsActive =
      contractCounts.find((c) => c.status === 'ACTIVE')?._count._all ?? 0;
    const contractsCompleted =
      contractCounts.find((c) => c.status === 'COMPLETED')?._count._all ?? 0;
    const sumByStatus = (
      rows: Array<{ status: string; _sum: { amountCents: number | null } }>,
      status: string,
    ) => rows.find((r) => r.status === status)?._sum.amountCents ?? 0;

    const escrowHeldCents = sumByStatus(milestoneAggregates, 'FUNDED');
    const releasedCents = sumByStatus(milestoneAggregates, 'RELEASED');
    const refundedCents = sumByStatus(milestoneAggregates, 'REFUNDED');
    const payoutsPaidCents = sumByStatus(payoutAggregates, 'PAID');
    const payoutsPendingCents =
      sumByStatus(payoutAggregates, 'PENDING') +
      sumByStatus(payoutAggregates, 'IN_TRANSIT');
    const payoutsFailedCents = sumByStatus(payoutAggregates, 'FAILED');

    let platformFeeCents = 0;
    const monthly = new Map<
      string,
      { gross: number; fee: number; refund: number }
    >();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(d.getUTCMonth() - i);
      monthly.set(this.monthKey(d), { gross: 0, fee: 0, refund: 0 });
    }

    for (const m of releasedMilestones) {
      const fee = Math.floor((m.amountCents * m.contract.platformFeeBps) / 10_000);
      platformFeeCents += fee;
      if (m.releasedAt) {
        const key = this.monthKey(m.releasedAt);
        const bucket = monthly.get(key);
        if (bucket) {
          bucket.gross += m.amountCents;
          bucket.fee += fee;
        }
      }
    }

    // Refunds by month
    const refunded = await this.prisma.milestone.findMany({
      where: { status: 'REFUNDED', refundedAt: { not: null } },
      select: { amountCents: true, refundedAt: true },
    });
    for (const r of refunded) {
      if (!r.refundedAt) continue;
      const key = this.monthKey(r.refundedAt);
      const bucket = monthly.get(key);
      if (bucket) bucket.refund += r.amountCents;
    }

    return {
      totals: {
        contractsActive,
        contractsCompleted,
        escrowHeldCents,
        releasedCents,
        refundedCents,
        platformFeeCents,
        payoutsPaidCents,
        payoutsPendingCents,
        payoutsFailedCents,
        activeSubscriptions: activeSubs,
      },
      monthlyRevenue: [...monthly.entries()].map(([month, v]) => ({
        month,
        grossCents: v.gross,
        feeCents: v.fee,
        refundCents: v.refund,
      })),
      recent: {
        contracts: recentContractRows.map((r) => this.toContractRow(r)),
        payouts: recentPayoutRows.map((r) => this.toPayoutRow(r)),
      },
    };
  }

  private monthKey(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  // ====================================================================
  // Contracts
  // ====================================================================

  async listContracts(
    query: AdminContractsQuery,
  ): Promise<{ items: AdminContractRow[]; nextCursor: string | null }> {
    const where: Prisma.ContractWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { company: { name: { contains: query.q, mode: 'insensitive' } } },
        { trainer: { name: { contains: query.q, mode: 'insensitive' } } },
        { trainer: { email: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    const rows = await this.prisma.contract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.contractInclude(),
    });
    const hasMore = rows.length > query.limit;
    const sliced = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: sliced.map((r) => this.toContractRow(r)),
      nextCursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
    };
  }

  async getContract(id: string): Promise<AdminContractDetail> {
    const row = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        ...this.contractInclude(),
        milestones: {
          orderBy: { order: 'asc' },
          include: {
            paymentIntents: { orderBy: { createdAt: 'desc' } },
            payouts: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Contract not found');

    const baseRow = this.toContractRow(row);
    return {
      ...baseRow,
      description: row.description,
      applicationId: row.applicationId,
      milestones: row.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        amountCents: m.amountCents,
        order: m.order,
        dueDate: m.dueDate?.toISOString() ?? null,
        status: m.status as MilestoneStatus,
        fundedAt: m.fundedAt?.toISOString() ?? null,
        releasedAt: m.releasedAt?.toISOString() ?? null,
        refundedAt: m.refundedAt?.toISOString() ?? null,
        paymentIntents: m.paymentIntents.map((pi) => ({
          id: pi.id,
          stripePaymentIntentId: pi.stripePaymentIntentId,
          amountCents: pi.amountCents,
          status: pi.status,
          receiptUrl: pi.receiptUrl,
          failureMessage: pi.failureMessage,
          createdAt: pi.createdAt.toISOString(),
        })),
        payouts: m.payouts.map((p) => ({
          id: p.id,
          amountCents: p.amountCents,
          status: p.status as PayoutStatus,
          stripeTransferId: p.stripeTransferId,
          stripePayoutId: p.stripePayoutId,
          arrivedAt: p.arrivedAt?.toISOString() ?? null,
          failureMessage: p.failureMessage,
          createdAt: p.createdAt.toISOString(),
        })),
      })),
    };
  }

  async refundMilestone(
    actor: AdminActor,
    milestoneId: string,
    input: AdminRefundMilestoneInput,
  ): Promise<{ ok: true }> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { contract: true },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.status !== 'FUNDED') {
      throw new ConflictException(
        `Cannot refund milestone in state ${milestone.status} (expected FUNDED)`,
      );
    }
    const lastPi = await this.prisma.paymentIntent.findFirst({
      where: { milestoneId: milestone.id, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastPi) {
      throw new ConflictException(
        'No successful PaymentIntent recorded for this milestone — cannot refund',
      );
    }

    // Run the Stripe refund inside the DB transaction so the milestone status
    // and AuditLog row only commit if Stripe accepted the refund. The Stripe
    // call is keyed on `admin-refund-${milestone.id}` so a retry after a DB
    // failure replays as a no-op on Stripe's side and the second attempt's DB
    // write commits cleanly.
    await this.prisma.$transaction(
      async (tx) => {
        await this.stripe.refundPaymentIntent({
          paymentIntentId: lastPi.stripePaymentIntentId,
          reason: input.reason,
          idempotencyKey: `admin-refund-${milestone.id}`,
        });
        await tx.milestone.update({
          where: { id: milestone.id },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.actorId,
            action: FINANCE_AUDIT_ACTIONS.ADMIN_REFUND_MILESTONE,
            entityType: 'Milestone',
            entityId: milestone.id,
            ip: actor.ip ?? null,
            diff: {
              milestoneId: milestone.id,
              contractId: milestone.contractId,
              amountCents: milestone.amountCents,
              stripePaymentIntentId: lastPi.stripePaymentIntentId,
              reason: input.reason,
            } as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 30_000 },
    );

    return { ok: true };
  }

  // ====================================================================
  // Payouts
  // ====================================================================

  async listPayouts(
    query: AdminPayoutsQuery,
  ): Promise<{ items: AdminPayoutRow[]; nextCursor: string | null }> {
    const where: Prisma.PayoutWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { user: { name: { contains: query.q, mode: 'insensitive' } } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
        { stripeTransferId: { contains: query.q, mode: 'insensitive' } },
        { stripePayoutId: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.payoutInclude(),
    });
    const hasMore = rows.length > query.limit;
    const sliced = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: sliced.map((r) => this.toPayoutRow(r)),
      nextCursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * Re-issue a Stripe Transfer for a payout that previously failed. Useful
   * after the recipient updated their Connect account or the platform
   * resolved a temporary error. Idempotent by `retry-${payoutId}-${attempt}`.
   */
  async retryPayout(actor: AdminActor, payoutId: string): Promise<{ ok: true }> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        milestone: { include: { contract: true } },
      },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'FAILED' && payout.status !== 'CANCELLED') {
      throw new ConflictException(
        `Cannot retry payout in state ${payout.status} (expected FAILED or CANCELLED)`,
      );
    }
    if (!payout.milestone) {
      throw new BadRequestException(
        'Payout is not attached to a milestone; cannot determine destination amount',
      );
    }
    const connect = await this.prisma.stripeConnectAccount.findUnique({
      where: { userId: payout.userId },
    });
    if (!connect || connect.status !== 'ACTIVE' || !connect.payoutsEnabled) {
      throw new ConflictException(
        'Trainer Stripe Connect account is not active — cannot retry payout',
      );
    }

    // Each click of "Retry" must produce a unique Stripe idempotency key —
    // otherwise Stripe replays the result of the first attempt and silently
    // returns the stale transfer id even when the underlying problem (e.g.
    // insufficient platform balance) has since been fixed. Counting the
    // existing ADMIN_RETRY_PAYOUT audit logs for this payout gives us a
    // monotonic attempt number that increments by exactly one per retry.
    const previousAttempts = await this.prisma.auditLog.count({
      where: {
        action: FINANCE_AUDIT_ACTIONS.ADMIN_RETRY_PAYOUT,
        entityType: 'Payout',
        entityId: payout.id,
      },
    });
    const attempt = previousAttempts + 1;

    // Run the Stripe transfer inside the DB transaction so the payout row
    // and audit row only commit if Stripe accepted the call. Idempotency
    // key embeds the attempt counter so a retry after a transient DB
    // failure replays as a no-op against Stripe.
    await this.prisma.$transaction(
      async (tx) => {
        const transfer = await this.stripe.createTransfer({
          amountCents: payout.amountCents,
          currency: payout.currency,
          destinationAccountId: connect.stripeAccountId,
          description: `Admin retry — payout ${payout.id} attempt ${attempt}`,
          idempotencyKey: `retry-${payout.id}-${attempt}`,
          metadata: {
            adminRetry: 'true',
            previousPayoutId: payout.id,
            milestoneId: payout.milestoneId ?? '',
            attempt: String(attempt),
          },
        });
        await tx.payout.update({
          where: { id: payout.id },
          data: {
            stripeTransferId: transfer.id,
            status: 'PENDING',
            failureMessage: null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.actorId,
            action: FINANCE_AUDIT_ACTIONS.ADMIN_RETRY_PAYOUT,
            entityType: 'Payout',
            entityId: payout.id,
            ip: actor.ip ?? null,
            diff: {
              payoutId: payout.id,
              previousStatus: payout.status,
              stripeTransferId: transfer.id,
              amountCents: payout.amountCents,
              attempt,
            } as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 30_000 },
    );

    return { ok: true };
  }

  async cancelPayout(actor: AdminActor, payoutId: string): Promise<{ ok: true }> {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'PENDING' && payout.status !== 'FAILED') {
      throw new ConflictException(
        `Cannot cancel payout in state ${payout.status} (expected PENDING or FAILED)`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payout.id },
        data: { status: 'CANCELLED' },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: FINANCE_AUDIT_ACTIONS.ADMIN_CANCEL_PAYOUT,
          entityType: 'Payout',
          entityId: payout.id,
          ip: actor.ip ?? null,
          diff: {
            payoutId: payout.id,
            previousStatus: payout.status,
          } as Prisma.InputJsonValue,
        },
      });
    });
    return { ok: true };
  }

  // ====================================================================
  // Subscriptions
  // ====================================================================

  async listSubscriptions(
    query: AdminSubscriptionsQuery,
  ): Promise<{ items: AdminSubscriptionRow[]; nextCursor: string | null }> {
    const where: Prisma.SubscriptionWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { user: { name: { contains: query.q, mode: 'insensitive' } } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
        { stripeSubscriptionId: { contains: query.q, mode: 'insensitive' } },
        { stripeCustomerId: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    const planIds = [...new Set(rows.map((r) => r.planId))];
    const plans = planIds.length
      ? await this.prisma.plan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, tier: true, audience: true },
        })
      : [];
    const planById = new Map(plans.map((p) => [p.id, p]));
    const hasMore = rows.length > query.limit;
    const sliced = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: sliced.map((s) => {
        const plan = planById.get(s.planId);
        return {
          id: s.id,
          status: s.status,
          currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: s.cancelAtPeriodEnd,
          stripeSubscriptionId: s.stripeSubscriptionId,
          stripeCustomerId: s.stripeCustomerId,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          user: s.user,
          plan: plan
            ? { id: plan.id, tier: plan.tier, audience: plan.audience as PlanAudience }
            : { id: s.planId, tier: 'unknown', audience: 'COMPANY' as PlanAudience },
        };
      }),
      nextCursor: hasMore ? (sliced[sliced.length - 1]?.id ?? null) : null,
    };
  }

  async cancelSubscription(
    actor: AdminActor,
    subscriptionId: string,
    input: AdminCancelSubscriptionInput,
  ): Promise<{ ok: true }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status === 'CANCELED') {
      throw new ConflictException('Subscription already canceled');
    }
    const before = {
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };

    if (sub.stripeSubscriptionId) {
      try {
        await this.stripe.cancelSubscription(sub.stripeSubscriptionId, {
          immediate: input.immediate ?? false,
        });
      } catch (err) {
        // Log but don't fail — Stripe row may have been removed externally;
        // we still want to mark our DB row as canceled to stop billing UI.
        this.logger.warn(
          `Stripe cancel failed for sub ${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: input.immediate ? 'CANCELED' : sub.status,
          cancelAtPeriodEnd: !input.immediate,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: FINANCE_AUDIT_ACTIONS.ADMIN_CANCEL_SUBSCRIPTION,
          entityType: 'Subscription',
          entityId: sub.id,
          ip: actor.ip ?? null,
          diff: {
            subscriptionId: sub.id,
            before,
            immediate: input.immediate,
            reason: input.reason ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    });
    return { ok: true };
  }

  // ====================================================================
  // Plans
  // ====================================================================

  async listPlans(): Promise<AdminPlanRow[]> {
    const rows = await this.prisma.plan.findMany({
      orderBy: [{ audience: 'asc' }, { priceMonthly: 'asc' }],
    });
    const counts = await this.prisma.subscription.groupBy({
      by: ['planId'],
      _count: { _all: true },
      where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    });
    const countByPlan = new Map(counts.map((c) => [c.planId, c._count._all]));
    return rows.map((p) => ({
      id: p.id,
      audience: p.audience as PlanAudience,
      tier: p.tier,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      featuresJson: p.featuresJson,
      stripePriceId: p.stripePriceId,
      createdAt: p.createdAt.toISOString(),
      subscriptionsCount: countByPlan.get(p.id) ?? 0,
    }));
  }

  async createPlan(actor: AdminActor, input: AdminPlanInput): Promise<AdminPlanRow> {
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.plan.create({
        data: {
          audience: input.audience,
          tier: input.tier,
          priceMonthly: input.priceMonthly,
          priceYearly: input.priceYearly,
          featuresJson: input.featuresJson as Prisma.InputJsonValue,
          stripePriceId: input.stripePriceId ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: FINANCE_AUDIT_ACTIONS.ADMIN_PLAN_CREATED,
          entityType: 'Plan',
          entityId: row.id,
          ip: actor.ip ?? null,
          diff: { after: input } as Prisma.InputJsonValue,
        },
      });
      return row;
    });
    return {
      id: created.id,
      audience: created.audience as PlanAudience,
      tier: created.tier,
      priceMonthly: created.priceMonthly,
      priceYearly: created.priceYearly,
      featuresJson: created.featuresJson,
      stripePriceId: created.stripePriceId,
      createdAt: created.createdAt.toISOString(),
      subscriptionsCount: 0,
    };
  }

  async updatePlan(
    actor: AdminActor,
    id: string,
    input: AdminPlanUpdateInput,
  ): Promise<AdminPlanRow> {
    const before = await this.prisma.plan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Plan not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.plan.update({
        where: { id },
        data: {
          ...(input.audience !== undefined ? { audience: input.audience } : {}),
          ...(input.tier !== undefined ? { tier: input.tier } : {}),
          ...(input.priceMonthly !== undefined ? { priceMonthly: input.priceMonthly } : {}),
          ...(input.priceYearly !== undefined ? { priceYearly: input.priceYearly } : {}),
          ...(input.featuresJson !== undefined
            ? { featuresJson: input.featuresJson as Prisma.InputJsonValue }
            : {}),
          ...(input.stripePriceId !== undefined
            ? { stripePriceId: input.stripePriceId ?? null }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: FINANCE_AUDIT_ACTIONS.ADMIN_PLAN_UPDATED,
          entityType: 'Plan',
          entityId: id,
          ip: actor.ip ?? null,
          diff: { before, after: input } as Prisma.InputJsonValue,
        },
      });
      return row;
    });
    const subscriptionsCount = await this.prisma.subscription.count({
      where: { planId: id, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    });
    return {
      id: updated.id,
      audience: updated.audience as PlanAudience,
      tier: updated.tier,
      priceMonthly: updated.priceMonthly,
      priceYearly: updated.priceYearly,
      featuresJson: updated.featuresJson,
      stripePriceId: updated.stripePriceId,
      createdAt: updated.createdAt.toISOString(),
      subscriptionsCount,
    };
  }

  async deletePlan(actor: AdminActor, id: string): Promise<{ ok: true }> {
    // Match listPlans which only counts active subscriptions, so the UI's
    // "subscribers > 0 → disable delete" check stays consistent with the API.
    const subs = await this.prisma.subscription.count({
      where: { planId: id, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    });
    if (subs > 0) {
      throw new ConflictException(
        `Cannot delete plan with ${subs} active subscription(s); cancel them first`,
      );
    }
    const before = await this.prisma.plan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Plan not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.plan.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: FINANCE_AUDIT_ACTIONS.ADMIN_PLAN_DELETED,
          entityType: 'Plan',
          entityId: id,
          ip: actor.ip ?? null,
          diff: { before } as Prisma.InputJsonValue,
        },
      });
    });
    return { ok: true };
  }

  // ====================================================================
  // Helpers
  // ====================================================================

  private contractInclude() {
    return {
      company: { select: { id: true, name: true, slug: true } },
      trainer: { select: { id: true, name: true, email: true } },
      milestones: {
        select: { id: true, status: true },
      },
    } satisfies Prisma.ContractInclude;
  }

  private payoutInclude() {
    return {
      user: { select: { id: true, name: true, email: true } },
      milestone: {
        select: {
          id: true,
          title: true,
          contractId: true,
          contract: { select: { title: true } },
        },
      },
    } satisfies Prisma.PayoutInclude;
  }

  private toContractRow(
    r: Prisma.ContractGetPayload<{ include: ReturnType<AdminFinanceService['contractInclude']> }>,
  ): AdminContractRow {
    const summary = { total: 0, funded: 0, released: 0, refunded: 0 };
    for (const m of r.milestones) {
      summary.total += 1;
      if (m.status === 'FUNDED') summary.funded += 1;
      else if (m.status === 'RELEASED') summary.released += 1;
      else if (m.status === 'REFUNDED') summary.refunded += 1;
    }
    return {
      id: r.id,
      title: r.title,
      status: r.status as ContractStatus,
      currency: r.currency,
      totalAmountCents: r.totalAmountCents,
      platformFeeBps: r.platformFeeBps,
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      company: r.company,
      trainer: r.trainer,
      milestoneSummary: summary,
    };
  }

  private toPayoutRow(
    r: Prisma.PayoutGetPayload<{ include: ReturnType<AdminFinanceService['payoutInclude']> }>,
  ): AdminPayoutRow {
    return {
      id: r.id,
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status as PayoutStatus,
      stripeTransferId: r.stripeTransferId,
      stripePayoutId: r.stripePayoutId,
      failureMessage: r.failureMessage,
      arrivedAt: r.arrivedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      trainer: r.user,
      milestone: r.milestone
        ? {
            id: r.milestone.id,
            title: r.milestone.title,
            contractId: r.milestone.contractId,
            contractTitle: r.milestone.contract.title,
          }
        : null,
    };
  }
}
