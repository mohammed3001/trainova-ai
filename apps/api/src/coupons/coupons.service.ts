import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@trainova/db';
import {
  computeCouponDiscount,
  getStripeMinChargeMinor,
  type CouponPreviewResult,
  type CouponScope,
  type CreateCouponInput,
  type ListCouponsQuery,
  type PreviewCouponInput,
  type PublicCoupon,
  type UpdateCouponInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

type CouponRow = Prisma.CouponGetPayload<true>;
type TxClient = Omit<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;

/**
 * Coupons service.
 *
 * Two responsibilities:
 *
 *   1. Admin CRUD — list/get/create/update/delete + observability counters
 *      (`redeemedCount`, `totalDiscountMinor`).
 *
 *   2. `applyToMilestone` / `applyToSubscription` — called from
 *      {@link PaymentsService} *inside the same Prisma transaction* that
 *      the milestone/subscription row is created/updated in. The apply
 *      methods (a) re-validate the coupon with row-locked reads,
 *      (b) compute the discount, (c) insert a CouponRedemption, and
 *      (d) bump the counters atomically. The unique constraints on
 *      `CouponRedemption.milestoneId` / `subscriptionId` mean a single
 *      payment object can be discounted at most once even under retry.
 */
@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===================================================================
  // Admin CRUD
  // ===================================================================

  async list(query: ListCouponsQuery): Promise<{
    items: PublicCoupon[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where: Prisma.CouponWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.appliesTo) where.appliesTo = query.appliesTo;
    if (query.q) {
      where.OR = [
        { code: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return {
      items: items.map(toPublicCoupon),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(id: string): Promise<PublicCoupon> {
    const row = await this.prisma.coupon.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Coupon not found');
    return toPublicCoupon(row);
  }

  async create(input: CreateCouponInput, actorId: string): Promise<PublicCoupon> {
    // Validate plan ids exist (cheap upfront check; saves admins from
    // creating dead coupons that never apply).
    if (input.planIds.length > 0) {
      const found = await this.prisma.plan.count({
        where: { id: { in: input.planIds } },
      });
      if (found !== input.planIds.length) {
        throw new BadRequestException('One or more planIds do not exist');
      }
    }
    try {
      const row = await this.prisma.coupon.create({
        data: {
          code: input.code,
          description: input.description ?? null,
          kind: input.kind,
          amountOff: input.amountOff,
          currency: input.currency ? input.currency.toUpperCase() : null,
          audience: input.audience,
          appliesTo: input.appliesTo,
          planIds: input.planIds,
          minAmountMinor: input.minAmountMinor ?? null,
          maxDiscountMinor: input.maxDiscountMinor ?? null,
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          maxRedemptions: input.maxRedemptions ?? null,
          perUserLimit: input.perUserLimit,
          stripeCouponId: input.stripeCouponId ?? null,
          createdById: actorId,
        },
      });
      return toPublicCoupon(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Coupon code already exists');
      }
      throw e;
    }
  }

  async update(id: string, input: UpdateCouponInput): Promise<PublicCoupon> {
    // Read existing row first so we can cross-validate the validity
    // window against stored values when the patch only touches one of
    // the two date fields (otherwise an admin could set validFrom past
    // an existing validUntil — or vice versa — and silently brick the
    // coupon since assertEligible would never find a window where both
    // checks pass).
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');

    const data: Prisma.CouponUpdateInput = {};
    if (input.description !== undefined) data.description = input.description;
    if (input.audience !== undefined) data.audience = input.audience;
    if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo;
    if (input.planIds !== undefined) data.planIds = input.planIds;
    if (input.minAmountMinor !== undefined) data.minAmountMinor = input.minAmountMinor;
    if (input.maxDiscountMinor !== undefined) data.maxDiscountMinor = input.maxDiscountMinor;
    if (input.validFrom !== undefined) {
      data.validFrom = input.validFrom ? new Date(input.validFrom) : null;
    }
    if (input.validUntil !== undefined) {
      data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
    }
    if (input.maxRedemptions !== undefined) data.maxRedemptions = input.maxRedemptions;
    if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit;
    if (input.status !== undefined) data.status = input.status;
    if (input.stripeCouponId !== undefined) data.stripeCouponId = input.stripeCouponId;

    const effectiveFrom =
      input.validFrom !== undefined
        ? input.validFrom
          ? new Date(input.validFrom)
          : null
        : existing.validFrom;
    const effectiveUntil =
      input.validUntil !== undefined
        ? input.validUntil
          ? new Date(input.validUntil)
          : null
        : existing.validUntil;
    if (effectiveFrom && effectiveUntil && effectiveFrom >= effectiveUntil) {
      throw new BadRequestException('validUntil must be after validFrom');
    }
    const row = await this.prisma.coupon
      .update({ where: { id }, data })
      .catch((e) => {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2025'
        ) {
          throw new NotFoundException('Coupon not found');
        }
        throw e;
      });
    return toPublicCoupon(row);
  }

  async remove(id: string): Promise<void> {
    // Soft-disable rather than hard delete — preserves redemption rows
    // and audit trail. Admins who really want it gone can DELETE again
    // after disabling and confirm a hard wipe (out of MVP scope).
    const row = await this.prisma.coupon.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Coupon not found');
    if (row.status === 'DISABLED') {
      throw new ConflictException('Coupon already disabled');
    }
    await this.prisma.coupon.update({
      where: { id },
      data: { status: 'DISABLED' },
    });
  }

  // ===================================================================
  // Preview
  // ===================================================================

  async preview(
    userId: string,
    userRole: string,
    input: PreviewCouponInput,
  ): Promise<CouponPreviewResult> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: input.code },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    this.assertEligible(coupon, {
      scope: input.scope,
      planId: input.planId,
      userRole,
    });
    const compute = computeCouponDiscount(
      {
        kind: coupon.kind,
        amountOff: coupon.amountOff,
        currency: coupon.currency,
        maxDiscountMinor: coupon.maxDiscountMinor,
        minAmountMinor: coupon.minAmountMinor,
      },
      input.amountMinor,
      input.currency,
    );
    if (!compute.applicable) {
      throw new BadRequestException(compute.reason ?? 'Coupon cannot be applied');
    }
    // Stripe minimum charge gate. A 100% PERCENT or large FIXED coupon
    // could otherwise drop `finalMinor` to zero (or below the per-currency
    // floor) — Stripe would then reject the PaymentIntent *after* the
    // CouponRedemption row has been written, permanently consuming the
    // user's single-use slot with no payment. Guard at preview *and* at
    // apply time so neither path can commit a redemption that's
    // guaranteed to fail at the gateway.
    if (input.scope === 'MILESTONE' || input.scope === 'SUBSCRIPTION') {
      const min = getStripeMinChargeMinor(input.currency);
      if (compute.finalMinor < min) {
        throw new BadRequestException(
          'Coupon discount reduces the charge below the minimum payment amount',
        );
      }
    }
    // Global redemption cap — surface the failure at preview time so
    // the buyer sees "Coupon redemption limit reached" up front instead
    // of being held until the apply step at payment time. The
    // authoritative cap is re-checked inside applyTo* under the
    // redemption transaction so this preview check is safe under
    // concurrency.
    if (
      coupon.maxRedemptions != null &&
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      throw new ConflictException('Coupon redemption limit reached');
    }
    // Per-user limit check (read-only here; the authoritative check is
    // inside applyTo* which runs in a transaction with the redemption
    // insert).
    if (coupon.perUserLimit > 0) {
      const used = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (used >= coupon.perUserLimit) {
        throw new ConflictException('Coupon already redeemed by this user');
      }
    }
    return {
      code: coupon.code,
      kind: coupon.kind,
      amountOff: coupon.amountOff,
      originalMinor: input.amountMinor,
      discountMinor: compute.discountMinor,
      finalMinor: compute.finalMinor,
      currency: input.currency.toUpperCase(),
      description: coupon.description,
    };
  }

  // ===================================================================
  // Apply (called from PaymentsService inside its own transaction)
  // ===================================================================

  /**
   * Apply a coupon to a milestone funding. Must be called *inside* the
   * same Prisma transaction that ultimately funds the milestone (so the
   * redemption row + counter bump roll back if the Stripe call fails).
   *
   * Discount math (`discountMinor` / `finalMinor`) is supplied by the
   * caller — it must be the *same* result that the corresponding
   * Stripe PaymentIntent was created with (i.e. from `preview()` run
   * just before the Stripe call). Recomputing here from the freshly
   * loaded coupon row would let an admin's mid-flight edit of
   * `amountOff` / `maxDiscountMinor` / `minAmountMinor` desync the
   * `CouponRedemption` row from the actual Stripe charge.
   * `applyToSubscription` follows the same convention.
   *
   * Eligibility (audience/scope/expiry/status), per-user limit, global
   * `maxRedemptions` cap and Stripe-min-charge floor are still
   * re-validated here against the live coupon row so a coupon that was
   * disabled or hit its cap between preview and apply is rejected.
   */
  async applyToMilestone(
    tx: TxClient,
    args: {
      code: string;
      userId: string;
      userRole: string;
      milestoneId: string;
      originalMinor: number;
      discountMinor: number;
      finalMinor: number;
      currency: string;
    },
  ): Promise<{ couponId: string; discountMinor: number; finalMinor: number }> {
    // Two-step read: resolve the coupon by code first, then take the
    // row lock by id, then RE-READ to get the post-lock state. The
    // first read can't itself be FOR UPDATE because we only have the
    // code here (and FOR UPDATE on a SELECT-by-unique-text via Prisma
    // is awkward); the lock + re-read pattern below is equivalent.
    //
    // Serialize all redemption attempts for this coupon. SELECT ... FOR
    // UPDATE on the Coupon row makes the maxRedemptions / perUserLimit
    // check-then-write below atomic w.r.t. concurrent transactions:
    // a second tx can't read redeemedCount or count(redemptions) until
    // this transaction commits or rolls back. Without this guard, two
    // concurrent fundMilestone calls under READ COMMITTED could each
    // observe redeemedCount == maxRedemptions - 1, both pass the cap
    // check, and both insert a redemption + increment the counter,
    // exceeding the cap by one.
    const couponPreLock = await tx.coupon.findUnique({ where: { code: args.code } });
    if (!couponPreLock) throw new NotFoundException('Coupon not found');
    await tx.$executeRaw`SELECT 1 FROM "Coupon" WHERE id = ${couponPreLock.id} FOR UPDATE`;
    // Re-read after the lock so `redeemedCount` and `status` reflect
    // any commit that landed between the unique-by-code read and the
    // lock acquisition. Without this re-read the cap check at the
    // bottom of the method uses the pre-lock counter and admits the
    // (maxRedemptions + 1)-th redemption.
    const coupon = await tx.coupon.findUnique({ where: { id: couponPreLock.id } });
    if (!coupon) throw new NotFoundException('Coupon not found');

    // Idempotency for fundMilestone retries: the unique constraint on
    // CouponRedemption.milestoneId means a concurrent/retry path that
    // already wrote the redemption (with a possibly-discounted Stripe
    // charge already on file under the same `fund-${milestoneId}`
    // idempotency key) must see a *successful* re-apply with the same
    // financial values it originally wrote. Reject only when the prior
    // redemption was for a *different* coupon code or user.
    const existing = await tx.couponRedemption.findUnique({
      where: { milestoneId: args.milestoneId },
    });
    if (existing) {
      if (existing.couponId !== coupon.id || existing.userId !== args.userId) {
        throw new ConflictException(
          'Milestone already has a different coupon applied',
        );
      }
      return {
        couponId: existing.couponId,
        discountMinor: existing.discountMinor,
        finalMinor: existing.finalAmountMinor,
      };
    }

    this.assertEligible(coupon, {
      scope: 'MILESTONE',
      userRole: args.userRole,
    });
    // Stripe minimum charge gate (see preview() for rationale).
    // Inside the redemption transaction so a sub-floor amount never
    // commits a redemption row that the Stripe call would later reject.
    const minCharge = getStripeMinChargeMinor(args.currency);
    if (args.finalMinor < minCharge) {
      throw new BadRequestException(
        'Coupon discount reduces the charge below the minimum payment amount',
      );
    }
    if (coupon.perUserLimit > 0) {
      const used = await tx.couponRedemption.count({
        where: { couponId: coupon.id, userId: args.userId },
      });
      if (used >= coupon.perUserLimit) {
        throw new ConflictException('Coupon already redeemed by this user');
      }
    }
    if (
      coupon.maxRedemptions != null &&
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      throw new ConflictException('Coupon redemption limit reached');
    }
    try {
      await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId: args.userId,
          scope: 'MILESTONE',
          milestoneId: args.milestoneId,
          originalAmountMinor: args.originalMinor,
          discountMinor: args.discountMinor,
          finalAmountMinor: args.finalMinor,
          currency: args.currency.toUpperCase(),
        },
      });
    } catch (e) {
      // A racing request could have inserted the redemption between our
      // findUnique and create. Re-read and reconcile by code/user; this
      // keeps fundMilestone retry-safe even under concurrency.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await tx.couponRedemption.findUnique({
          where: { milestoneId: args.milestoneId },
        });
        if (
          raced &&
          raced.couponId === coupon.id &&
          raced.userId === args.userId
        ) {
          return {
            couponId: raced.couponId,
            discountMinor: raced.discountMinor,
            finalMinor: raced.finalAmountMinor,
          };
        }
        throw new ConflictException(
          'Milestone already has a different coupon applied',
        );
      }
      throw e;
    }
    await tx.coupon.update({
      where: { id: coupon.id },
      data: {
        redeemedCount: { increment: 1 },
        totalDiscountMinor: { increment: args.discountMinor },
      },
    });
    return {
      couponId: coupon.id,
      discountMinor: args.discountMinor,
      finalMinor: args.finalMinor,
    };
  }

  /**
   * Reverse a milestone coupon redemption when the milestone is refunded.
   *
   * Must run inside the same Prisma transaction as the milestone
   * `status: REFUNDED` write so a partial failure (e.g. AuditLog insert
   * blowing up) rolls the counter changes back along with the milestone.
   *
   * Without this, a refunded milestone leaves the redemption row in
   * place and the cap counters incremented, which means:
   *   - `maxRedemptions: 1` is consumed forever even though the buyer
   *     never paid;
   *   - a user blocked by `perUserLimit` cannot retry on a different
   *     milestone after a refund;
   *   - `totalDiscountMinor` analytics is inflated.
   *
   * No-op for milestones that were funded without a coupon.
   */
  async reverseForMilestone(tx: TxClient, milestoneId: string): Promise<void> {
    const redemption = await tx.couponRedemption.findUnique({
      where: { milestoneId },
    });
    if (!redemption) return;
    // Lock the coupon row before we adjust counters so a concurrent
    // applyToMilestone for the same coupon serializes against this
    // reversal — same rationale as the FOR UPDATE in apply paths.
    await tx.$executeRaw`SELECT 1 FROM "Coupon" WHERE id = ${redemption.couponId} FOR UPDATE`;
    await tx.coupon.update({
      where: { id: redemption.couponId },
      data: {
        redeemedCount: { decrement: 1 },
        totalDiscountMinor: { decrement: redemption.discountMinor },
      },
    });
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
  }

  /**
   * Reverse a subscription coupon redemption when the subscription is
   * cancelled before it ever charged. Same semantics as
   * {@link reverseForMilestone}; no-op for subscriptions that were
   * created without a coupon.
   */
  async reverseForSubscription(tx: TxClient, subscriptionId: string): Promise<void> {
    const redemption = await tx.couponRedemption.findUnique({
      where: { subscriptionId },
    });
    if (!redemption) return;
    await tx.$executeRaw`SELECT 1 FROM "Coupon" WHERE id = ${redemption.couponId} FOR UPDATE`;
    await tx.coupon.update({
      where: { id: redemption.couponId },
      data: {
        redeemedCount: { decrement: 1 },
        totalDiscountMinor: { decrement: redemption.discountMinor },
      },
    });
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
  }

  /**
   * Apply a coupon to a Stripe subscription. SUBSCRIPTION coupons must
   * have `stripeCouponId` set — Stripe owns the recurring discount and
   * we just pass it through to `subscriptions.create`. We record a
   * redemption row so the per-user limit + analytics counters work the
   * same as for milestones.
   */
  async applyToSubscription(
    tx: TxClient,
    args: {
      code: string;
      userId: string;
      userRole: string;
      planId: string;
      subscriptionId: string;
      originalMinor: number;
      discountMinor: number;
      finalMinor: number;
      currency: string;
    },
  ): Promise<{ couponId: string; stripeCouponId: string }> {
    // Lock + re-read pattern — see applyToMilestone for the full
    // rationale. The first read resolves the coupon by code; the FOR
    // UPDATE locks the row by id; the second read returns the
    // post-lock counters/status so the cap and assertEligible checks
    // below are not stale.
    const couponPreLock = await tx.coupon.findUnique({ where: { code: args.code } });
    if (!couponPreLock) throw new NotFoundException('Coupon not found');
    await tx.$executeRaw`SELECT 1 FROM "Coupon" WHERE id = ${couponPreLock.id} FOR UPDATE`;
    const coupon = await tx.coupon.findUnique({ where: { id: couponPreLock.id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    this.assertEligible(coupon, {
      scope: 'SUBSCRIPTION',
      planId: args.planId,
      userRole: args.userRole,
    });
    if (!coupon.stripeCouponId) {
      throw new BadRequestException(
        'Coupon is not configured for subscriptions (missing Stripe coupon mirror)',
      );
    }
    if (coupon.perUserLimit > 0) {
      const used = await tx.couponRedemption.count({
        where: { couponId: coupon.id, userId: args.userId },
      });
      if (used >= coupon.perUserLimit) {
        throw new ConflictException('Coupon already redeemed by this user');
      }
    }
    if (
      coupon.maxRedemptions != null &&
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      throw new ConflictException('Coupon redemption limit reached');
    }
    try {
      await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId: args.userId,
          scope: 'SUBSCRIPTION',
          subscriptionId: args.subscriptionId,
          originalAmountMinor: args.originalMinor,
          discountMinor: args.discountMinor,
          finalAmountMinor: args.finalMinor,
          currency: args.currency.toUpperCase(),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Subscription already has a coupon applied');
      }
      throw e;
    }
    await tx.coupon.update({
      where: { id: coupon.id },
      data: {
        redeemedCount: { increment: 1 },
        totalDiscountMinor: { increment: args.discountMinor },
      },
    });
    return {
      couponId: coupon.id,
      stripeCouponId: coupon.stripeCouponId,
    };
  }

  /**
   * Resolve a Stripe coupon id without applying yet — used by
   * subscribe() so it can pass the id to `subscriptions.create` *before*
   * we have a Subscription row to attach a redemption to. The caller is
   * responsible for invoking `applyToSubscription` afterwards inside
   * the same transaction once the row exists.
   */
  async resolveForSubscription(
    code: string,
    args: { userId: string; userRole: string; planId: string },
  ): Promise<{
    coupon: CouponRow;
    stripeCouponId: string;
  }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    this.assertEligible(coupon, {
      scope: 'SUBSCRIPTION',
      planId: args.planId,
      userRole: args.userRole,
    });
    if (!coupon.stripeCouponId) {
      throw new BadRequestException(
        'Coupon is not configured for subscriptions (missing Stripe coupon mirror)',
      );
    }
    if (coupon.perUserLimit > 0) {
      const used = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId: args.userId },
      });
      if (used >= coupon.perUserLimit) {
        throw new ConflictException('Coupon already redeemed by this user');
      }
    }
    if (
      coupon.maxRedemptions != null &&
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      throw new ConflictException('Coupon redemption limit reached');
    }
    return { coupon, stripeCouponId: coupon.stripeCouponId };
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  private assertEligible(
    coupon: CouponRow,
    args: { scope: CouponScope; planId?: string; userRole: string },
  ): void {
    if (coupon.status !== 'ACTIVE') {
      throw new ForbiddenException('Coupon is not active');
    }
    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now) {
      throw new ForbiddenException('Coupon is not yet valid');
    }
    if (coupon.validUntil && coupon.validUntil < now) {
      throw new ForbiddenException('Coupon has expired');
    }
    if (coupon.appliesTo !== 'ANY' && coupon.appliesTo !== args.scope) {
      throw new ForbiddenException(
        `Coupon does not apply to ${args.scope.toLowerCase()} purchases`,
      );
    }
    if (coupon.audience !== 'ANY') {
      const isCompany =
        args.userRole === 'COMPANY_OWNER' || args.userRole === 'COMPANY_MEMBER';
      const isTrainer = args.userRole === 'TRAINER';
      if (coupon.audience === 'COMPANY' && !isCompany) {
        throw new ForbiddenException('Coupon is restricted to companies');
      }
      if (coupon.audience === 'TRAINER' && !isTrainer) {
        throw new ForbiddenException('Coupon is restricted to trainers');
      }
    }
    if (args.scope === 'SUBSCRIPTION' && coupon.planIds.length > 0) {
      // Plan-restricted coupon needs to know which plan the caller is
      // checking against. Without that, an earlier `args.planId &&`
      // short-circuit silently passed plan-restricted previews when no
      // planId was provided — misleading the buyer with a discount
      // that the apply step would later refuse.
      if (!args.planId) {
        throw new BadRequestException(
          'planId is required to validate a plan-restricted coupon',
        );
      }
      if (!coupon.planIds.includes(args.planId)) {
        throw new ForbiddenException('Coupon is not valid for this plan');
      }
    }
  }
}

function toPublicCoupon(row: CouponRow): PublicCoupon {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    kind: row.kind,
    amountOff: row.amountOff,
    currency: row.currency,
    audience: row.audience,
    appliesTo: row.appliesTo,
    planIds: row.planIds,
    minAmountMinor: row.minAmountMinor,
    maxDiscountMinor: row.maxDiscountMinor,
    validFrom: row.validFrom?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    maxRedemptions: row.maxRedemptions,
    perUserLimit: row.perUserLimit,
    redeemedCount: row.redeemedCount,
    totalDiscountMinor: row.totalDiscountMinor,
    status: row.status,
    stripeCouponId: row.stripeCouponId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
