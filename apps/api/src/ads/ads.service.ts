import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AD_PLACEMENTS,
  type AdCampaignStatus,
  type AdPlacement,
  type AdPricingModel,
  type CreateCampaignInput,
  type CreateCreativeInput,
  type ImpressionInput,
  type AdminAdCampaign,
  type OwnerAdCampaign,
  type OwnerAdCreative,
  type PublicAdCampaign,
  type PublicAdCreative,
  type RejectCampaignInput,
  type ServeAdsInput,
  type StartAdTopupResponse,
  type TopupCampaignInput,
  type UpdateCampaignInput,
  type UpdateCreativeInput,
} from '@trainova/shared';
import type { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { StripeService } from '../payments/stripe.service';

/**
 * T4.D Ads — advertiser self-serve, admin review, and runtime ad
 * serving.
 *
 * Billing model:
 *   - Advertisers prepay a budget via Stripe PaymentIntent (top-up).
 *     Top-ups only hit `budgetCents` on `payment_intent.succeeded`.
 *   - Each impression (CPM) / click (CPC) / activation (FLAT) debits
 *     `spentCents` in a transaction that also inserts the impression
 *     row — the row and the debit can't disagree.
 *   - When `spentCents >= budgetCents`, the campaign stops serving. A
 *     new top-up re-opens it automatically.
 *
 * Serving is cheap: a single indexed query filtered by `status=ACTIVE`,
 * placement, remaining budget, and (optional) targeting. No per-request
 * joins against `AdImpression`.
 */
@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  // ===================================================================
  // Advertiser CRUD
  // ===================================================================

  async createCampaign(userId: string, input: CreateCampaignInput): Promise<OwnerAdCampaign> {
    const companyId = await this.resolveOwnedCompanyId(userId, input.companyId);
    const row = await this.prisma.adCampaign.create({
      data: {
        ownerId: userId,
        companyId: companyId ?? undefined,
        name: input.name,
        pricingModel: input.pricingModel,
        cpmCents: input.cpmCents ?? null,
        cpcCents: input.cpcCents ?? null,
        flatFeeCents: input.flatFeeCents ?? null,
        targetingCountries: input.targetingCountries,
        targetingLocales: input.targetingLocales,
        targetingSkillIds: input.targetingSkillIds,
        frequencyCapPerDay: input.frequencyCapPerDay ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: 'DRAFT',
      },
      include: campaignInclude(),
    });
    return toOwnerCampaign(row);
  }

  async updateCampaign(
    userId: string,
    campaignId: string,
    input: UpdateCampaignInput,
  ): Promise<OwnerAdCampaign> {
    const campaign = await this.loadOwned(userId, campaignId);
    if (campaign.status === 'ENDED' || campaign.status === 'REJECTED') {
      throw new ConflictException('Campaign is closed to edits');
    }
    // Pricing fields can always be tightened upward; we don't let a
    // PENDING_REVIEW row change pricing model out from under an admin
    // who's still looking at it.
    if (campaign.status === 'PENDING_REVIEW') {
      throw new ConflictException('Cannot edit a campaign while it is under review');
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        name: input.name ?? undefined,
        cpmCents: input.cpmCents ?? undefined,
        cpcCents: input.cpcCents ?? undefined,
        flatFeeCents: input.flatFeeCents ?? undefined,
        targetingCountries: input.targetingCountries ?? undefined,
        targetingLocales: input.targetingLocales ?? undefined,
        targetingSkillIds: input.targetingSkillIds ?? undefined,
        frequencyCapPerDay:
          input.frequencyCapPerDay === null
            ? null
            : input.frequencyCapPerDay ?? undefined,
        startDate: input.startDate === null ? null : input.startDate ?? undefined,
        endDate: input.endDate === null ? null : input.endDate ?? undefined,
      },
      include: campaignInclude(),
    });
    return toOwnerCampaign(updated);
  }

  async submitCampaign(userId: string, campaignId: string): Promise<OwnerAdCampaign> {
    const campaign = await this.loadOwned(userId, campaignId);
    if (campaign.status !== 'DRAFT') {
      throw new ConflictException(`Cannot submit a ${campaign.status} campaign`);
    }
    const creativeCount = await this.prisma.adCreative.count({
      where: { campaignId },
    });
    if (creativeCount === 0) {
      throw new BadRequestException('Add at least one creative before submitting');
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: { status: 'PENDING_REVIEW' },
      include: campaignInclude(),
    });
    return toOwnerCampaign(updated);
  }

  async deleteCampaign(userId: string, campaignId: string): Promise<{ ok: true }> {
    const campaign = await this.loadOwned(userId, campaignId);
    if (campaign.status === 'ACTIVE' || campaign.status === 'APPROVED') {
      throw new ConflictException('Pause the campaign before deleting it');
    }
    await this.prisma.adCampaign.delete({ where: { id: campaignId } });
    return { ok: true };
  }

  async listMyCampaigns(userId: string): Promise<OwnerAdCampaign[]> {
    const rows = await this.prisma.adCampaign.findMany({
      where: { ownerId: userId },
      include: campaignInclude(),
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toOwnerCampaign);
  }

  async getCampaign(userId: string, campaignId: string): Promise<OwnerAdCampaign> {
    const campaign = await this.loadOwnedWithInclude(userId, campaignId);
    return toOwnerCampaign(campaign);
  }

  // ===================================================================
  // Creatives
  // ===================================================================

  async addCreative(
    userId: string,
    campaignId: string,
    input: CreateCreativeInput,
  ): Promise<OwnerAdCreative> {
    const campaign = await this.loadOwned(userId, campaignId);
    if (campaign.status === 'ENDED' || campaign.status === 'REJECTED') {
      throw new ConflictException('Campaign is closed to edits');
    }
    const row = await this.prisma.adCreative.create({
      data: {
        campaignId,
        type: input.type,
        headline: input.headline,
        body: input.body ?? null,
        ctaLabel: input.ctaLabel ?? null,
        ctaUrl: input.ctaUrl,
        assetUrl: input.assetUrl || null,
        placements: input.placements,
        weight: input.weight,
        isActive: input.isActive,
      },
    });
    return toOwnerCreative(row);
  }

  async updateCreative(
    userId: string,
    creativeId: string,
    input: UpdateCreativeInput,
  ): Promise<OwnerAdCreative> {
    const creative = await this.loadOwnedCreative(userId, creativeId);
    if (creative.campaign.status === 'ENDED' || creative.campaign.status === 'REJECTED') {
      throw new ConflictException('Campaign is closed to edits');
    }
    const updated = await this.prisma.adCreative.update({
      where: { id: creativeId },
      data: {
        type: input.type ?? undefined,
        headline: input.headline ?? undefined,
        body: input.body ?? undefined,
        ctaLabel: input.ctaLabel ?? undefined,
        ctaUrl: input.ctaUrl ?? undefined,
        assetUrl: input.assetUrl === undefined ? undefined : input.assetUrl || null,
        placements: input.placements ?? undefined,
        weight: input.weight ?? undefined,
        isActive: input.isActive ?? undefined,
      },
    });
    return toOwnerCreative(updated);
  }

  async deleteCreative(userId: string, creativeId: string): Promise<{ ok: true }> {
    const creative = await this.loadOwnedCreative(userId, creativeId);
    if (creative.campaign.status === 'ACTIVE') {
      throw new ConflictException('Pause the campaign before deleting creatives');
    }
    await this.prisma.adCreative.delete({ where: { id: creativeId } });
    return { ok: true };
  }

  // ===================================================================
  // Top-up (Stripe PaymentIntent on saved card)
  // ===================================================================

  async startTopup(
    userId: string,
    campaignId: string,
    input: TopupCampaignInput,
  ): Promise<StartAdTopupResponse> {
    const campaign = await this.loadOwned(userId, campaignId);
    const customerId = await this.payments.ensureStripeCustomerForUser(userId);
    const topup = await this.prisma.adTopup.create({
      data: {
        campaignId: campaign.id,
        amountCents: input.amountCents,
        currency: input.currency,
        status: 'PENDING',
      },
    });
    let pi;
    try {
      pi = await this.stripe.createEscrowPaymentIntent({
        amountCents: input.amountCents,
        currency: input.currency,
        customerId,
        paymentMethodId: input.paymentMethodId,
        description: `Ad budget top-up for campaign ${campaign.id}`,
        returnUrl: `${this.stripe.publicWebUrl}/ads/campaigns/${campaign.id}`,
        metadata: {
          trainovaAdTopupId: topup.id,
          trainovaAdCampaignId: campaign.id,
          trainovaAdOwnerId: userId,
        },
        idempotencyKey: `ad-topup-${topup.id}`,
      });
    } catch (err) {
      await this.prisma.adTopup.update({
        where: { id: topup.id },
        data: { status: 'FAILED' },
      });
      throw err;
    }
    await this.prisma.adTopup.update({
      where: { id: topup.id },
      data: { stripePaymentIntentId: pi.id },
    });
    if (!pi.client_secret) {
      throw new ServiceUnavailableException('Stripe did not return a PaymentIntent client_secret');
    }
    // Fast-path: if the PI already confirmed synchronously we credit
    // the budget here so the UI reflects the new balance without
    // waiting for the webhook to round-trip. The webhook is still the
    // source of truth and is idempotent against this.
    if (pi.status === 'succeeded') {
      await this.creditBudget(topup.id, pi.id, input.amountCents);
    }
    return {
      topupId: topup.id,
      clientSecret: pi.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    };
  }

  /**
   * Webhook handler — `payment_intent.succeeded` with
   * `metadata.trainovaAdTopupId` set credits the budget.
   */
  async handleTopupSucceeded(stripePaymentIntentId: string): Promise<void> {
    const topup = await this.prisma.adTopup.findUnique({
      where: { stripePaymentIntentId },
    });
    if (!topup) return; // Not an ads PI.
    if (topup.status === 'SUCCEEDED') return; // Idempotent.
    await this.creditBudget(topup.id, stripePaymentIntentId, topup.amountCents);
  }

  async handleTopupFailed(
    stripePaymentIntentId: string,
    reason: string | null,
  ): Promise<void> {
    const topup = await this.prisma.adTopup.findUnique({
      where: { stripePaymentIntentId },
    });
    if (!topup) return;
    if (topup.status === 'SUCCEEDED' || topup.status === 'FAILED') return;
    await this.prisma.adTopup.update({
      where: { id: topup.id },
      data: { status: 'FAILED' },
    });
    this.logger.warn(
      `Ad topup ${topup.id} failed (PI=${stripePaymentIntentId}): ${reason ?? 'no reason'}`,
    );
  }

  private async creditBudget(
    topupId: string,
    _piId: string,
    amountCents: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.adTopup.findUnique({ where: { id: topupId } });
      if (!current || current.status === 'SUCCEEDED') return;
      await tx.adTopup.update({
        where: { id: topupId },
        data: { status: 'SUCCEEDED' },
      });
      // Re-activate campaigns that were auto-paused for running out of
      // runway. APPROVED / DRAFT / PENDING_REVIEW / REJECTED / ENDED are
      // left alone on purpose. Admin- or owner-initiated pauses also stay
      // paused — only `pausedReason='BUDGET_EXHAUSTED'` is safe to auto-
      // reverse, because that's the reason we ourselves flipped it in
      // `recordImpression`. A top-up must never resume a campaign that an
      // admin paused for a policy violation.
      const campaign = await tx.adCampaign.findUnique({
        where: { id: current.campaignId },
        select: { status: true, pausedReason: true },
      });
      const shouldReactivate =
        campaign?.status === 'PAUSED' &&
        campaign.pausedReason === 'BUDGET_EXHAUSTED';
      await tx.adCampaign.update({
        where: { id: current.campaignId },
        data: {
          budgetCents: { increment: amountCents },
          ...(shouldReactivate ? { status: 'ACTIVE' as const, pausedReason: null } : {}),
        },
      });
    });
    this.logger.log(`Ad topup ${topupId} credited ${amountCents} cents`);
  }

  // ===================================================================
  // Admin review
  // ===================================================================

  async listPendingForAdmin(): Promise<AdminAdCampaign[]> {
    const rows = await this.prisma.adCampaign.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: adminCampaignInclude(),
      orderBy: { updatedAt: 'asc' },
    });
    return rows.map(toAdminCampaign);
  }

  async listAllForAdmin(status?: AdCampaignStatus): Promise<AdminAdCampaign[]> {
    const rows = await this.prisma.adCampaign.findMany({
      where: status ? { status } : {},
      include: adminCampaignInclude(),
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return rows.map(toAdminCampaign);
  }

  async approveCampaign(
    adminId: string,
    campaignId: string,
  ): Promise<AdminAdCampaign> {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'PENDING_REVIEW') {
      throw new ConflictException(`Cannot approve a ${campaign.status} campaign`);
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
      include: adminCampaignInclude(),
    });
    return toAdminCampaign(updated);
  }

  async rejectCampaign(
    adminId: string,
    campaignId: string,
    input: RejectCampaignInput,
  ): Promise<AdminAdCampaign> {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'PENDING_REVIEW') {
      throw new ConflictException(`Cannot reject a ${campaign.status} campaign`);
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'REJECTED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: input.reason,
      },
      include: adminCampaignInclude(),
    });
    return toAdminCampaign(updated);
  }

  async pauseCampaign(
    actorId: string,
    campaignId: string,
    isAdmin: boolean,
  ): Promise<OwnerAdCampaign> {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!isAdmin && campaign.ownerId !== actorId) {
      throw new ForbiddenException('Not your campaign');
    }
    if (campaign.status !== 'ACTIVE' && campaign.status !== 'APPROVED') {
      throw new ConflictException(`Cannot pause a ${campaign.status} campaign`);
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'PAUSED',
        // Record *why* we paused so a later top-up does not accidentally
        // reactivate a campaign that was paused for policy reasons.
        pausedReason: isAdmin ? 'ADMIN' : 'OWNER',
      },
      include: campaignInclude(),
    });
    return toOwnerCampaign(updated);
  }

  async resumeCampaign(
    actorId: string,
    campaignId: string,
    isAdmin: boolean,
  ): Promise<OwnerAdCampaign> {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!isAdmin && campaign.ownerId !== actorId) {
      throw new ForbiddenException('Not your campaign');
    }
    if (campaign.status !== 'PAUSED') {
      throw new ConflictException('Only paused campaigns can be resumed');
    }
    if (campaign.spentCents >= campaign.budgetCents) {
      throw new ConflictException('Top up the budget before resuming');
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: { status: 'ACTIVE', pausedReason: null },
      include: campaignInclude(),
    });
    return toOwnerCampaign(updated);
  }

  // ===================================================================
  // Public serving
  // ===================================================================

  async serveAds(
    input: ServeAdsInput,
    _session: { sessionHash: string; userId?: string | null },
  ): Promise<PublicAdCreative[]> {
    const now = new Date();
    const candidateCreatives = await this.prisma.adCreative.findMany({
      where: {
        isActive: true,
        placements: { has: input.placement },
        campaign: {
          status: 'ACTIVE',
          OR: [{ startDate: null }, { startDate: { lte: now } }],
          AND: [
            { OR: [{ endDate: null }, { endDate: { gte: now } }] },
            ...(input.country
              ? [
                  {
                    OR: [
                      { targetingCountries: { isEmpty: true } },
                      { targetingCountries: { has: input.country } },
                    ],
                  },
                ]
              : []),
            ...(input.locale
              ? [
                  {
                    OR: [
                      { targetingLocales: { isEmpty: true } },
                      { targetingLocales: { has: input.locale } },
                    ],
                  },
                ]
              : []),
            ...(input.skillIds && input.skillIds.length > 0
              ? [
                  {
                    OR: [
                      { targetingSkillIds: { isEmpty: true } },
                      { targetingSkillIds: { hasSome: input.skillIds } },
                    ],
                  },
                ]
              : []),
          ],
        },
      },
      include: { campaign: true },
      take: 50,
    });

    // Prisma doesn't express `spentCents < budgetCents` as a single
    // WHERE clause (no column-to-column operator), so the out-of-runway
    // guard is applied in-process — cheap at `take: 50` and still lets
    // the indexed campaign/status filter do the heavy lifting.
    const affordable = candidateCreatives.filter(
      (c) => c.campaign.spentCents < c.campaign.budgetCents,
    );
    const picked = weightedPickN(affordable, input.limit);
    return picked.map((c) => toPublicCreative(c));
  }

  async recordImpression(
    input: ImpressionInput,
    session: {
      sessionHash: string;
      userId?: string | null;
      locale?: string;
      country?: string;
    },
  ): Promise<{ ok: true; skipped?: 'budget' | 'frequency' | 'status' }> {
    const creative = await this.prisma.adCreative.findUnique({
      where: { id: input.creativeId },
      include: { campaign: true },
    });
    if (!creative) throw new NotFoundException('Creative not found');
    if (creative.campaign.status !== 'ACTIVE') {
      return { ok: true, skipped: 'status' };
    }
    const chargeMicro = computeImpressionChargeMicro(creative.campaign.pricingModel, {
      cpm: creative.campaign.cpmCents,
    });
    const budgetMicro = BigInt(creative.campaign.budgetCents) * 1000n;
    const spentMicro = creative.campaign.spentMicroCents;
    if (spentMicro + chargeMicro > budgetMicro) {
      // Auto-pause so the server stops serving a campaign that can't
      // pay for its own impressions. Tag the pause so that a subsequent
      // top-up (see `creditBudget`) is allowed to auto-resume — admin /
      // owner manual pauses are tagged differently and stay paused.
      await this.prisma.adCampaign.update({
        where: { id: creative.campaignId },
        data: { status: 'PAUSED', pausedReason: 'BUDGET_EXHAUSTED' },
      });
      return { ok: true, skipped: 'budget' };
    }
    if (creative.campaign.frequencyCapPerDay && session.sessionHash) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.prisma.adImpression.count({
        where: {
          campaignId: creative.campaignId,
          sessionHash: session.sessionHash,
          createdAt: { gte: since },
        },
      });
      if (recent >= creative.campaign.frequencyCapPerDay) {
        return { ok: true, skipped: 'frequency' };
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.adImpression.create({
        data: {
          creativeId: creative.id,
          campaignId: creative.campaignId,
          placement: input.placement,
          locale: session.locale ?? null,
          country: session.country ?? null,
          sessionHash: session.sessionHash ?? null,
          userId: session.userId ?? null,
          // Displayed whole-cent charge; sub-cent accrual lives on the
          // campaign row (spentMicroCents).
          chargedCents: Number(chargeMicro / 1000n),
        },
      });
      await tx.adCreative.update({
        where: { id: creative.id },
        data: { impressionCount: { increment: 1 } },
      });
      if (chargeMicro > 0n) {
        // Atomic: increment the microcent accumulator and derive the
        // whole-cent display value from the post-increment value.
        await tx.$executeRaw`
          UPDATE "AdCampaign"
          SET "spentMicroCents" = "spentMicroCents" + ${chargeMicro}::BIGINT,
              "spentCents" = FLOOR(("spentMicroCents" + ${chargeMicro}::BIGINT) / 1000)::INT
          WHERE id = ${creative.campaignId}
        `;
      }
    });
    return { ok: true };
  }

  async recordClickAndResolve(
    creativeId: string,
    session: {
      sessionHash: string;
      userId?: string | null;
      locale?: string;
      country?: string;
    },
    placement?: AdPlacement,
  ): Promise<{ ctaUrl: string }> {
    const creative = await this.prisma.adCreative.findUnique({
      where: { id: creativeId },
      include: { campaign: true },
    });
    if (!creative) throw new NotFoundException('Creative not found');
    if (!creative.isActive) throw new NotFoundException('Creative not found');
    const chargeMicro = computeClickChargeMicro(creative.campaign.pricingModel, {
      cpc: creative.campaign.cpcCents,
    });
    const budgetMicro = BigInt(creative.campaign.budgetCents) * 1000n;
    const spentMicro = creative.campaign.spentMicroCents;
    // A click is allowed even if the campaign paused *right before* the
    // click — the user already saw the ad. But we don't over-charge.
    const willChargeMicro =
      creative.campaign.status === 'ACTIVE' && spentMicro + chargeMicro <= budgetMicro
        ? chargeMicro
        : 0n;
    await this.prisma.$transaction(async (tx) => {
      await tx.adClick.create({
        data: {
          creativeId: creative.id,
          campaignId: creative.campaignId,
          // The click endpoint accepts `?p=` and forwards a validated
          // AdPlacement; we fall back to NATIVE_LISTING only if the
          // caller (or a very old client) omitted the hint.
          placement: placement ?? 'NATIVE_LISTING',
          locale: session.locale ?? null,
          country: session.country ?? null,
          sessionHash: session.sessionHash ?? null,
          userId: session.userId ?? null,
          chargedCents: Number(willChargeMicro / 1000n),
        },
      });
      await tx.adCreative.update({
        where: { id: creative.id },
        data: { clickCount: { increment: 1 } },
      });
      if (willChargeMicro > 0n) {
        await tx.$executeRaw`
          UPDATE "AdCampaign"
          SET "spentMicroCents" = "spentMicroCents" + ${willChargeMicro}::BIGINT,
              "spentCents" = FLOOR(("spentMicroCents" + ${willChargeMicro}::BIGINT) / 1000)::INT
          WHERE id = ${creative.campaignId}
        `;
      }
    });
    return { ctaUrl: creative.ctaUrl };
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  private async resolveOwnedCompanyId(
    userId: string,
    hint?: string,
  ): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
    });
    if (hint && (!company || company.id !== hint)) {
      throw new ForbiddenException('That company does not belong to you');
    }
    return company?.id ?? null;
  }

  private async loadOwned(userId: string, campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign || campaign.ownerId !== userId) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private async loadOwnedWithInclude(userId: string, campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: campaignInclude(),
    });
    if (!campaign || campaign.ownerId !== userId) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private async loadOwnedCreative(userId: string, creativeId: string) {
    const creative = await this.prisma.adCreative.findUnique({
      where: { id: creativeId },
      include: { campaign: true },
    });
    if (!creative || creative.campaign.ownerId !== userId) {
      throw new NotFoundException('Creative not found');
    }
    return creative;
  }

  static hashSession(ip: string, userAgent: string): string {
    return createHash('sha256')
      .update(`${ip}::${userAgent}`)
      .digest('hex')
      .slice(0, 48);
  }
}

// -------------------- helpers --------------------

function campaignInclude() {
  return {
    creatives: { orderBy: { createdAt: 'asc' as const } },
  } satisfies Prisma.AdCampaignInclude;
}

function adminCampaignInclude() {
  return {
    creatives: { orderBy: { createdAt: 'asc' as const } },
    owner: { select: { id: true, name: true, email: true } },
    company: { select: { id: true, slug: true, name: true } },
  } satisfies Prisma.AdCampaignInclude;
}

function toOwnerCreative(row: {
  id: string;
  campaignId: string;
  type: string;
  headline: string;
  body: string | null;
  assetUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string;
  placements: string[];
  weight: number;
  isActive: boolean;
  impressionCount: number;
  clickCount: number;
  createdAt: Date;
  updatedAt: Date;
}): OwnerAdCreative {
  return {
    id: row.id,
    campaignId: row.campaignId,
    type: row.type as OwnerAdCreative['type'],
    headline: row.headline,
    body: row.body,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    assetUrl: row.assetUrl,
    placements: row.placements.filter((p): p is OwnerAdCreative['placements'][number] =>
      AD_PLACEMENTS.includes(p as OwnerAdCreative['placements'][number]),
    ),
    weight: row.weight,
    isActive: row.isActive,
    impressionCount: row.impressionCount,
    clickCount: row.clickCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toOwnerCampaign(
  row: Prisma.AdCampaignGetPayload<{ include: ReturnType<typeof campaignInclude> }>,
): OwnerAdCampaign {
  const base = toPublicCampaign(row);
  return {
    ...base,
    reviewedById: row.reviewedById ?? null,
    creatives: row.creatives.map(toOwnerCreative),
  };
}

function toAdminCampaign(
  row: Prisma.AdCampaignGetPayload<{ include: ReturnType<typeof adminCampaignInclude> }>,
): AdminAdCampaign {
  return {
    ...toOwnerCampaign(row),
    owner: row.owner ? { id: row.owner.id, name: row.owner.name, email: row.owner.email } : null,
    company: row.company
      ? { id: row.company.id, slug: row.company.slug, name: row.company.name }
      : null,
  };
}

function toPublicCampaign(
  row: Prisma.AdCampaignGetPayload<{ include: ReturnType<typeof campaignInclude> }>,
): PublicAdCampaign {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    companyId: row.companyId,
    pricingModel: row.pricingModel as AdPricingModel,
    cpmCents: row.cpmCents,
    cpcCents: row.cpcCents,
    flatFeeCents: row.flatFeeCents,
    budgetCents: row.budgetCents,
    spentCents: row.spentCents,
    status: row.status as AdCampaignStatus,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    targetingCountries: row.targetingCountries,
    targetingLocales: row.targetingLocales,
    targetingSkillIds: row.targetingSkillIds,
    frequencyCapPerDay: row.frequencyCapPerDay,
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    creatives: row.creatives.map(toPublicCreative),
    totals: {
      impressions: row.creatives.reduce((sum, c) => sum + c.impressionCount, 0),
      clicks: row.creatives.reduce((sum, c) => sum + c.clickCount, 0),
    },
  };
}

function toPublicCreative(row: {
  id: string;
  campaignId: string;
  type: string;
  headline: string;
  body: string | null;
  assetUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string;
  placements: string[];
}): PublicAdCreative {
  return {
    id: row.id,
    campaignId: row.campaignId,
    type: row.type as PublicAdCreative['type'],
    headline: row.headline,
    body: row.body,
    assetUrl: row.assetUrl,
    ctaLabel: row.ctaLabel,
    clickUrl: `/api/ads/click/${row.id}`,
    placements: row.placements.filter((p): p is PublicAdCreative['placements'][number] =>
      AD_PLACEMENTS.includes(p as PublicAdCreative['placements'][number]),
    ),
    sponsored: true,
  };
}

function computeImpressionChargeMicro(
  pricingModel: string,
  prices: { cpm: number | null },
): bigint {
  if (pricingModel === 'CPM' && prices.cpm) {
    // cpmCents is cost in cents per 1000 impressions. Per-impression cost
    // expressed in microcents (1/1000 of a cent) therefore equals cpmCents
    // numerically — no rounding loss even for sub-cent rates like $0.50 CPM
    // (cpmCents=50 → 50 microcents per impression).
    return BigInt(prices.cpm);
  }
  return 0n;
}

function computeClickChargeMicro(
  pricingModel: string,
  prices: { cpc: number | null },
): bigint {
  if (pricingModel === 'CPC' && prices.cpc) return BigInt(prices.cpc) * 1000n;
  return 0n;
}

/**
 * Weighted-random sample without replacement; O(n * limit) which is
 * fine since `take: 50` caps the candidate set.
 */
function weightedPickN<T extends { weight: number }>(pool: T[], limit: number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  while (picked.length < limit && remaining.length > 0) {
    const totalWeight = remaining.reduce(
      (sum, c) => sum + Math.max(c.weight, 1),
      0,
    );
    const roll = Math.random() * totalWeight;
    let cursor = 0;
    let idx = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      if (!candidate) continue;
      cursor += Math.max(candidate.weight, 1);
      if (cursor >= roll) {
        idx = i;
        break;
      }
    }
    const [chosen] = remaining.splice(idx, 1);
    if (chosen) picked.push(chosen);
  }
  return picked;
}

