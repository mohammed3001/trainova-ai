import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type SponsoredPlacement } from '@trainova/db';
import {
  type AdminCreateSponsoredInput,
  type AdminListSponsoredQuery,
  type AdminUpdateSponsoredInput,
  type SelfPaidCheckoutInput,
  type SelfPaidCheckoutResponse,
  type SponsoredKind,
  type SponsoredPlacementDTO,
  type SponsoredPlacementList,
  SPONSORED_PRICE_PER_DAY_CENTS,
  SPONSORED_WEIGHT_DEFAULT,
  SPONSORED_WEIGHT_MAX,
  SPONSORED_WEIGHT_MIN,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { StripeService } from '../payments/stripe.service';

/**
 * T7.G — Sponsored search ranking.
 *
 * Single source of truth for sponsored placements. Three responsibilities:
 *
 *  1. **Boost lookup** — `getActiveBoostMap(kind)` returns a `Map<id,
 *     totalBoost>` consumed by `MatchingService` and the public list
 *     endpoints. Boost is the sum of `weight` across in-window ACTIVE
 *     placements for that subject, hard-clamped to `[0, 50]` so a
 *     low-quality match can never outrank a high-quality unsponsored
 *     row by more than half the 0..100 score scale.
 *  2. **Admin CRUD** — admins can grant placements without payment
 *     (`source = ADMIN`), list / filter, mutate weight/window/status.
 *  3. **Self-paid checkout** — the trainer / company kicks off Stripe
 *     `PaymentIntent`s. The webhook in `StripeWebhookController` calls
 *     `handlePaymentSucceeded` which atomically activates the placement
 *     and refreshes the denormalised `sponsoredUntil` mirrors so list
 *     queries can sort without joins.
 */
@Injectable()
export class SponsoredService {
  private readonly logger = new Logger(SponsoredService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly payments: PaymentsService,
  ) {}

  // ===================================================================
  // Boost lookup (consumed by MatchingService + public listings)
  // ===================================================================

  /**
   * For the given subject kind, return a map keyed by:
   *   - `trainerProfileId` when `kind = TRAINER`
   *   - `jobRequestId`     when `kind = JOB_REQUEST`
   * to the **clamped sum** of all in-window ACTIVE placement weights.
   *
   * Returning a single map (rather than per-row queries) lets callers
   * apply boost to a candidate pool with one round trip.
   */
  async getActiveBoostMap(kind: SponsoredKind): Promise<Map<string, number>> {
    const now = new Date();
    const rows = await this.prisma.sponsoredPlacement.findMany({
      where: {
        kind,
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gte: now },
        ...(kind === 'TRAINER'
          ? { trainerProfileId: { not: null } }
          : { jobRequestId: { not: null } }),
      },
      select: {
        trainerProfileId: true,
        jobRequestId: true,
        weight: true,
      },
    });
    const out = new Map<string, number>();
    for (const r of rows) {
      const key =
        kind === 'TRAINER'
          ? (r.trainerProfileId as string)
          : (r.jobRequestId as string);
      const prev = out.get(key) ?? 0;
      out.set(
        key,
        Math.min(SPONSORED_WEIGHT_MAX, prev + Math.max(0, r.weight)),
      );
    }
    return out;
  }

  // ===================================================================
  // Admin CRUD
  // ===================================================================

  async adminList(query: AdminListSponsoredQuery): Promise<SponsoredPlacementList> {
    const where: Prisma.SponsoredPlacementWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.q
        ? {
            OR: [
              { owner: { name: { contains: query.q, mode: 'insensitive' } } },
              { owner: { email: { contains: query.q, mode: 'insensitive' } } },
              {
                trainerProfile: {
                  slug: { contains: query.q, mode: 'insensitive' },
                },
              },
              { jobRequest: { title: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.sponsoredPlacement.findMany({
        where,
        orderBy: [{ status: 'asc' }, { endsAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          trainerProfile: { select: { slug: true, headline: true } },
          jobRequest: { select: { slug: true, title: true } },
        },
      }),
      this.prisma.sponsoredPlacement.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.toDTO(r)),
      total,
    };
  }

  async adminCreate(
    adminId: string,
    input: AdminCreateSponsoredInput,
  ): Promise<SponsoredPlacementDTO> {
    const subject = await this.assertSubject(input.kind, {
      trainerProfileId: input.trainerProfileId,
      jobRequestId: input.jobRequestId,
    });
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be strictly after startsAt');
    }
    const placement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sponsoredPlacement.create({
        data: {
          kind: input.kind,
          trainerProfileId: input.trainerProfileId ?? null,
          jobRequestId: input.jobRequestId ?? null,
          ownerId: subject.ownerId,
          createdById: adminId,
          source: 'ADMIN',
          status: 'ACTIVE',
          weight: this.clampWeight(input.weight ?? SPONSORED_WEIGHT_DEFAULT),
          startsAt,
          endsAt,
          notes: input.notes ?? null,
          pricedCents: 0,
          currency: 'USD',
        },
        include: this.includeForDTO(),
      });
      await this.refreshSubjectMirror(tx, input.kind, {
        trainerProfileId: input.trainerProfileId ?? null,
        jobRequestId: input.jobRequestId ?? null,
      });
      return created;
    });
    return this.toDTO(placement);
  }

  async adminUpdate(
    adminId: string,
    id: string,
    patch: AdminUpdateSponsoredInput,
  ): Promise<SponsoredPlacementDTO> {
    const existing = await this.prisma.sponsoredPlacement.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Placement not found');

    const data: Prisma.SponsoredPlacementUpdateInput = {};
    if (patch.weight !== undefined) data.weight = this.clampWeight(patch.weight);
    if (patch.status !== undefined) {
      // Self-paid placements must not be flipped back to DRAFT — that would
      // orphan a captured PaymentIntent. Admin grants are free to move
      // through the lifecycle.
      if (
        existing.source === 'SELF_PAID' &&
        patch.status === 'DRAFT' &&
        existing.status !== 'DRAFT'
      ) {
        throw new ConflictException(
          'Cannot revert a paid placement to DRAFT',
        );
      }
      data.status = patch.status;
    }
    if (patch.endsAt !== undefined) {
      const ends = new Date(patch.endsAt);
      if (ends <= existing.startsAt) {
        throw new BadRequestException('endsAt must be strictly after startsAt');
      }
      data.endsAt = ends;
    }
    if (patch.notes !== undefined) data.notes = patch.notes;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.sponsoredPlacement.update({
        where: { id },
        data,
        include: this.includeForDTO(),
      });
      await this.refreshSubjectMirror(tx, row.kind, {
        trainerProfileId: row.trainerProfileId,
        jobRequestId: row.jobRequestId,
      });
      return row;
    });
    this.logger.log(
      `Admin ${adminId} updated SponsoredPlacement ${id} → ${JSON.stringify(
        Object.keys(patch),
      )}`,
    );
    return this.toDTO(updated);
  }

  async adminDelete(adminId: string, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.sponsoredPlacement.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Placement not found');
    if (existing.source === 'SELF_PAID' && existing.status === 'ACTIVE') {
      throw new ConflictException(
        'Cancel and refund the paid placement before deleting',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.sponsoredPlacement.delete({ where: { id } });
      await this.refreshSubjectMirror(tx, existing.kind, {
        trainerProfileId: existing.trainerProfileId,
        jobRequestId: existing.jobRequestId,
      });
    });
    this.logger.log(`Admin ${adminId} deleted SponsoredPlacement ${id}`);
    return { ok: true };
  }

  // ===================================================================
  // Self-paid checkout
  // ===================================================================

  async selfPaidCheckout(
    userId: string,
    input: SelfPaidCheckoutInput,
    paymentMethodId: string,
  ): Promise<SelfPaidCheckoutResponse> {
    if (!this.stripe.isConfigured) {
      throw new ServiceUnavailableException(
        'Sponsored checkout requires Stripe to be configured on this deployment',
      );
    }
    const subject = await this.assertSubject(input.kind, {
      trainerProfileId: input.trainerProfileId,
      jobRequestId: input.jobRequestId,
    });
    if (subject.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only sponsor a profile or request you own',
      );
    }
    const startsAt = new Date();
    const endsAt = new Date(
      startsAt.getTime() + input.days * 24 * 60 * 60 * 1000,
    );
    const pricedCents = input.days * SPONSORED_PRICE_PER_DAY_CENTS;

    // Create placement up-front so the Stripe metadata can carry its id.
    const placement = await this.prisma.sponsoredPlacement.create({
      data: {
        kind: input.kind,
        trainerProfileId: input.trainerProfileId ?? null,
        jobRequestId: input.jobRequestId ?? null,
        ownerId: userId,
        createdById: userId,
        source: 'SELF_PAID',
        status: 'PENDING_PAYMENT',
        weight: SPONSORED_WEIGHT_DEFAULT,
        startsAt,
        endsAt,
        pricedCents,
        currency: 'USD',
      },
    });

    const customerId = await this.payments.ensureStripeCustomerForUser(userId);
    let pi;
    try {
      pi = await this.stripe.createEscrowPaymentIntent({
        amountCents: pricedCents,
        currency: 'USD',
        customerId,
        paymentMethodId,
        description: `Sponsored placement ${placement.id} (${input.kind}, ${input.days}d)`,
        returnUrl: `${this.stripe.publicWebUrl}/sponsored/${placement.id}`,
        metadata: {
          trainovaSponsoredPlacementId: placement.id,
          trainovaSponsoredKind: input.kind,
          trainovaSponsoredOwnerId: userId,
        },
        idempotencyKey: `sponsored-${placement.id}`,
      });
    } catch (err) {
      // Stripe rejected the PI — flip to DRAFT so the row isn't stuck
      // waiting for a webhook that will never arrive. Owner can retry.
      await this.prisma.sponsoredPlacement.update({
        where: { id: placement.id },
        data: { status: 'DRAFT' },
      });
      throw err;
    }
    await this.prisma.sponsoredPlacement.update({
      where: { id: placement.id },
      data: { stripePaymentIntentId: pi.id },
    });
    if (!pi.client_secret) {
      throw new ServiceUnavailableException(
        'Stripe did not return a PaymentIntent client_secret',
      );
    }
    // Fast-path: if the PI confirmed synchronously, activate now so the
    // UI reflects the new state without waiting on the webhook. The
    // webhook is still source of truth and is idempotent against this.
    if (pi.status === 'succeeded') {
      await this.activate(placement.id);
    }
    return {
      placementId: placement.id,
      clientSecret: pi.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
      pricedCents,
      currency: 'USD',
    };
  }

  /**
   * Webhook entrypoint — `payment_intent.succeeded` with metadata
   * `trainovaSponsoredPlacementId` activates the placement.
   */
  async handlePaymentSucceeded(stripePaymentIntentId: string): Promise<void> {
    const placement = await this.prisma.sponsoredPlacement.findUnique({
      where: { stripePaymentIntentId },
    });
    if (!placement) return;
    if (placement.status === 'ACTIVE') return; // Idempotent.
    await this.activate(placement.id);
  }

  async handlePaymentFailed(
    stripePaymentIntentId: string,
    reason: string | null,
  ): Promise<void> {
    const placement = await this.prisma.sponsoredPlacement.findUnique({
      where: { stripePaymentIntentId },
    });
    if (!placement) return;
    if (placement.status === 'ACTIVE' || placement.status === 'REJECTED') return;
    await this.prisma.sponsoredPlacement.update({
      where: { id: placement.id },
      data: { status: 'DRAFT', notes: reason ?? null },
    });
    this.logger.warn(
      `Sponsored placement ${placement.id} payment failed (PI=${stripePaymentIntentId}): ${
        reason ?? 'no reason'
      }`,
    );
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  /**
   * Atomic-claim activate: only the caller that flips
   * PENDING_PAYMENT/DRAFT → ACTIVE refreshes the mirror, so concurrent
   * webhook + fast-path callers can't both push the subject's
   * `sponsoredUntil` forward.
   */
  private async activate(placementId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.sponsoredPlacement.updateMany({
        where: {
          id: placementId,
          status: { in: ['DRAFT', 'PENDING_PAYMENT'] },
        },
        data: { status: 'ACTIVE' },
      });
      if (claimed.count === 0) return;
      const placement = await tx.sponsoredPlacement.findUniqueOrThrow({
        where: { id: placementId },
        select: {
          kind: true,
          trainerProfileId: true,
          jobRequestId: true,
        },
      });
      await this.refreshSubjectMirror(tx, placement.kind, {
        trainerProfileId: placement.trainerProfileId,
        jobRequestId: placement.jobRequestId,
      });
    });
  }

  /**
   * Recomputes the denormalised `sponsoredUntil` column on the subject
   * row. Reads the max `endsAt` across that subject's ACTIVE placements
   * and writes the value (or null) to the trainer profile / job request.
   */
  private async refreshSubjectMirror(
    tx: Prisma.TransactionClient,
    kind: SponsoredKind,
    ids: { trainerProfileId: string | null; jobRequestId: string | null },
  ): Promise<void> {
    const now = new Date();
    if (kind === 'TRAINER') {
      if (!ids.trainerProfileId) return;
      const top = await tx.sponsoredPlacement.findFirst({
        where: {
          trainerProfileId: ids.trainerProfileId,
          status: 'ACTIVE',
          endsAt: { gte: now },
        },
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true },
      });
      await tx.trainerProfile.update({
        where: { id: ids.trainerProfileId },
        data: { sponsoredUntil: top?.endsAt ?? null },
      });
      return;
    }
    if (!ids.jobRequestId) return;
    const top = await tx.sponsoredPlacement.findFirst({
      where: {
        jobRequestId: ids.jobRequestId,
        status: 'ACTIVE',
        endsAt: { gte: now },
      },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });
    await tx.jobRequest.update({
      where: { id: ids.jobRequestId },
      data: { sponsoredUntil: top?.endsAt ?? null },
    });
  }

  private async assertSubject(
    kind: SponsoredKind,
    ids: { trainerProfileId?: string; jobRequestId?: string },
  ): Promise<{ ownerId: string }> {
    if (kind === 'TRAINER') {
      if (!ids.trainerProfileId) {
        throw new BadRequestException('trainerProfileId is required');
      }
      const tp = await this.prisma.trainerProfile.findUnique({
        where: { id: ids.trainerProfileId },
        select: { userId: true },
      });
      if (!tp) throw new NotFoundException('Trainer profile not found');
      return { ownerId: tp.userId };
    }
    if (!ids.jobRequestId) {
      throw new BadRequestException('jobRequestId is required');
    }
    const jr = await this.prisma.jobRequest.findUnique({
      where: { id: ids.jobRequestId },
      select: { company: { select: { ownerId: true } } },
    });
    if (!jr) throw new NotFoundException('Job request not found');
    return { ownerId: jr.company.ownerId };
  }

  private clampWeight(w: number): number {
    if (!Number.isFinite(w)) return SPONSORED_WEIGHT_DEFAULT;
    return Math.max(SPONSORED_WEIGHT_MIN, Math.min(SPONSORED_WEIGHT_MAX, Math.round(w)));
  }

  private includeForDTO() {
    return {
      owner: { select: { id: true, name: true, email: true } },
      trainerProfile: { select: { slug: true, headline: true } },
      jobRequest: { select: { slug: true, title: true } },
    } as const;
  }

  private toDTO(
    row: SponsoredPlacement & {
      owner: { id: string; name: string; email: string };
      trainerProfile: { slug: string; headline: string | null } | null;
      jobRequest: { slug: string; title: string } | null;
    },
  ): SponsoredPlacementDTO {
    const subjectLabel =
      row.kind === 'TRAINER'
        ? row.trainerProfile?.headline ?? row.trainerProfile?.slug ?? '(deleted trainer)'
        : row.jobRequest?.title ?? '(deleted job request)';
    const subjectSlug =
      row.kind === 'TRAINER'
        ? row.trainerProfile?.slug ?? null
        : row.jobRequest?.slug ?? null;
    return {
      id: row.id,
      kind: row.kind,
      trainerProfileId: row.trainerProfileId,
      jobRequestId: row.jobRequestId,
      ownerId: row.ownerId,
      ownerName: row.owner.name,
      ownerEmail: row.owner.email,
      source: row.source,
      status: row.status,
      weight: row.weight,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      pricedCents: row.pricedCents,
      currency: row.currency,
      stripePaymentIntentId: row.stripePaymentIntentId,
      notes: row.notes,
      subjectLabel,
      subjectSlug,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
