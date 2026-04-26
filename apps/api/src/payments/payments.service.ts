import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  computeTaxInclusive,
  type CreateContractInput,
  type FundMilestoneInput,
  type PaymentIntentStatus,
  type PublicContract,
  type PublicMilestone,
  type PublicPayout,
  type PublicStripeConnectAccount,
  type RefundMilestoneInput,
  type ReleaseMilestoneInput,
  type StripeConnectStatus,
  type SubscribePlanInput,
  type TrainerEarningsSummary,
} from '@trainova/shared';
import type { Stripe } from 'stripe/cjs/stripe.core.js';
import { CouponsService } from '../coupons/coupons.service';
import { InvoiceService } from '../invoicing/invoice.service';
import { TaxService } from '../invoicing/tax.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { computeCouponDiscount } from '@trainova/shared';

type ContractWithRelations = Prisma.ContractGetPayload<{
  include: {
    milestones: { orderBy: { order: 'asc' } };
    company: { select: { id: true; name: true; slug: true; logoUrl: true } };
    trainer: { select: { id: true; name: true; avatarUrl: true } };
  };
}>;

type MilestoneWithContract = Prisma.MilestoneGetPayload<{
  include: {
    contract: {
      include: {
        company: true;
        trainer: {
          select: { id: true; name: true; email: true };
          include: { stripeConnectAccount: true };
        };
      };
    };
  };
}>;

/**
 * Business rules for the escrow payments stack.
 *
 * Money flow for a single milestone:
 *   1. Company calls `fundMilestone`  →  Stripe PaymentIntent charges the
 *      company's card, funds land on the platform account; the milestone
 *      moves PENDING → FUNDED once the PI succeeds (via webhook *or* the
 *      synchronous confirm response if the payment is non-3DS).
 *   2. Company calls `releaseMilestone`  →  Stripe Transfer moves the
 *      (amount − platform fee) to the trainer's Connect account; the
 *      milestone moves FUNDED → RELEASED and we record a Payout row.
 *   3. Company calls `refundMilestone` on a FUNDED milestone  →  Stripe
 *      Refund returns the funds to the company; moves FUNDED → REFUNDED.
 *
 * All state transitions and Stripe calls are idempotent by construction
 * (we pass milestone ids as idempotency keys).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly tax: TaxService,
    private readonly invoices: InvoiceService,
    private readonly coupons: CouponsService,
    private readonly webhooks: WebhooksService,
  ) {}

  // ===================================================================
  // Contracts
  // ===================================================================

  async createContract(
    actorId: string,
    input: CreateContractInput,
  ): Promise<PublicContract> {
    const application = await this.prisma.application.findUnique({
      where: { id: input.applicationId },
      include: {
        request: { include: { company: true } },
      },
    });
    if (!application) throw new NotFoundException('Application not found');

    // Only the owning company can create a contract from an application,
    // and only once the candidate has been ACCEPTED. (Offering a contract
    // for a REJECTED / WITHDRAWN trainer would be a bug.)
    if (application.request.company.ownerId !== actorId) {
      throw new ForbiddenException(
        'Only the owning company can create a contract for this application',
      );
    }
    if (application.status !== 'ACCEPTED' && application.status !== 'OFFERED') {
      throw new BadRequestException(
        `Contracts can only be created from OFFERED/ACCEPTED applications (current: ${application.status})`,
      );
    }

    const total = input.milestones.reduce(
      (sum, m) => sum + m.amountCents,
      0,
    );

    // Resolve the tax treatment for this contract up front so every
    // milestone invoice issued later carries the same rate / label /
    // legal note — even if the admin edits the TaxRule catalog or the
    // buyer/seller country between funding calls.
    const [trainer, companyOwner] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: application.trainerId },
        include: { taxProfile: true },
      }),
      this.prisma.user.findUnique({
        where: { id: application.request.company.ownerId },
        include: { taxProfile: true },
      }),
    ]);
    const resolvedTax = await this.tax.resolve({
      sellerCountry: trainer?.taxProfile?.countryCode ?? null,
      buyerCountry:
        companyOwner?.taxProfile?.countryCode ?? application.request.company.country ?? null,
      // Reverse-charge is only lawful when the counterparty's tax id
      // has been *verified* by an admin — self-entered ids cannot
      // zero-rate a B2B invoice or HMRC/ZATCA will reject the return.
      sellerHasTaxId: !!(
        trainer?.taxProfile?.taxId && trainer.taxProfile.taxIdVerified
      ),
      buyerHasTaxId: !!(
        companyOwner?.taxProfile?.taxId &&
        companyOwner.taxProfile.taxIdVerified
      ),
    });
    // Compute each milestone's inclusive split first, then derive the
    // contract aggregates as the sum of those splits. Computing the
    // contract split independently from `total` causes integer-rounding
    // drift (e.g. two 333¢ milestones at 15% VAT round to 290/43 each
    // → 580/86, but the contract total 666 rounds to 578/88). Summing
    // the parts keeps the contract-level DTO fields and the milestone
    // list internally consistent.
    const milestoneData = input.milestones.map((m, idx) => {
      const msSplit = computeTaxInclusive(m.amountCents, resolvedTax.rateBps);
      return {
        title: m.title,
        description: m.description ?? null,
        amountCents: m.amountCents,
        subtotalCents: msSplit.subtotalCents,
        taxAmountCents: msSplit.taxAmountCents,
        order: idx,
        dueDate: m.dueDate ? new Date(m.dueDate) : null,
      };
    });
    const contractSubtotal = milestoneData.reduce(
      (sum, m) => sum + m.subtotalCents,
      0,
    );
    const contractTax = total - contractSubtotal;

    const contract = await this.prisma.contract.create({
      data: {
        applicationId: application.id,
        companyId: application.request.company.id,
        trainerId: application.trainerId,
        title: input.title,
        description: input.description ?? null,
        currency: input.currency,
        totalAmountCents: total,
        subtotalAmountCents: contractSubtotal,
        taxRateBps: resolvedTax.rateBps,
        taxAmountCents: contractTax,
        taxLabel: resolvedTax.label || null,
        taxNote: resolvedTax.note,
        reverseCharge: resolvedTax.reverseCharge,
        platformFeeBps: input.platformFeeBps ?? 1000,
        status: 'ACTIVE',
        acceptedAt: new Date(),
        milestones: { create: milestoneData },
      },
      include: this.contractInclude,
    });

    this.logger.log(
      `Contract ${contract.id} created: company=${contract.companyId} trainer=${contract.trainerId} total=${total}${contract.currency}`,
    );

    void this.webhooks.dispatch(contract.companyId, 'CONTRACT_CREATED', {
      contractId: contract.id,
      companyId: contract.companyId,
      trainerId: contract.trainerId,
      status: contract.status,
      totalMinor: contract.totalAmountCents,
      currency: contract.currency,
    });

    return this.toPublicContract(contract);
  }

  async listContractsForCompany(userId: string): Promise<PublicContract[]> {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (!company) return [];
    const rows = await this.prisma.contract.findMany({
      where: { companyId: company.id },
      include: this.contractInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPublicContract(r));
  }

  async listContractsForTrainer(userId: string): Promise<PublicContract[]> {
    const rows = await this.prisma.contract.findMany({
      where: { trainerId: userId },
      include: this.contractInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPublicContract(r));
  }

  async getContract(userId: string, id: string): Promise<PublicContract> {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        ...this.contractInclude,
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            ownerId: true,
          },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const isCompanyOwner = contract.company.ownerId === userId;
    const isTrainer = contract.trainerId === userId;
    if (!isCompanyOwner && !isTrainer) {
      throw new ForbiddenException('Not a party to this contract');
    }
    return this.toPublicContract(contract as ContractWithRelations);
  }

  // ===================================================================
  // Milestones — escrow state machine
  // ===================================================================

  async fundMilestone(
    userId: string,
    milestoneId: string,
    input: FundMilestoneInput,
  ): Promise<{ paymentIntentId: string; status: PaymentIntentStatus; clientSecret: string | null }> {
    const milestone = await this.loadMilestone(milestoneId);
    if (milestone.contract.company.ownerId !== userId) {
      throw new ForbiddenException('Only the owning company can fund milestones');
    }
    if (milestone.status !== 'PENDING') {
      throw new ConflictException(
        `Cannot fund milestone in state ${milestone.status} (expected PENDING)`,
      );
    }

    // Ensure the company has a Stripe customer so the PaymentIntent can
    // reuse saved payment methods and the charge appears on their
    // dashboard under the right entity.
    const company = await this.prisma.company.findUnique({
      where: { id: milestone.contract.companyId },
      include: { owner: { select: { id: true, email: true, name: true } } },
    });
    if (!company) throw new NotFoundException('Company not found');

    const customer = await this.stripe.ensureCustomer({
      existingId: company.stripeCustomerId,
      email: company.owner.email,
      name: company.name,
      metadata: { companyId: company.id, trainovaRole: 'COMPANY' },
    });
    if (customer.id !== company.stripeCustomerId) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    // T7.E — coupon flow is a strict three-phase pipeline:
    //   1. preview()      — read-only validation: audience/scope/expiry,
    //                       per-user + global redemption caps, currency
    //                       match, Stripe-min-charge gate, discount math.
    //                       Throws *before* anything irreversible runs.
    //   2. Stripe call    — idempotent via
    //                       `fund-${milestone.id}-${couponCode ?? 'none'}`.
    //                       The coupon code is part of the key because
    //                       changing it changes the charge amount;
    //                       Stripe rejects (HTTP 400) any reuse of an
    //                       idempotency key with different parameters.
    //                       If this throws, no DB row has been written yet,
    //                       so the coupon is preserved. If it returns a
    //                       PI in `requires_payment_method` (e.g. card
    //                       decline), that's a normal flow — the caller
    //                       retries with the client_secret and the
    //                       coupon stays applied.
    //   3. One Prisma tx  — upsert PaymentIntent + applyToMilestone
    //                       *atomically*. If applyToMilestone throws
    //                       inside the tx (true race on perUserLimit /
    //                       maxRedemptions), the PaymentIntent upsert
    //                       rolls back too. The Stripe PI is then
    //                       orphaned, but the user's coupon slot is
    //                       preserved; on retry the idempotency key
    //                       returns the same PI and the tx re-runs.
    // This matches the contract documented on
    // {@link CouponsService.applyToMilestone}.
    const ownerRole = await this.getUserRole(userId);
    let chargeAmountCents = milestone.amountCents;
    let plannedCoupon: {
      code: string;
      couponId: string;
      discountMinor: number;
      finalMinor: number;
    } | null = null;
    if (input.couponCode) {
      // preview() validates eligibility AND computes the authoritative
      // discount; we pass the *same* discount values into
      // applyToMilestone so the CouponRedemption row, the
      // `redeemedCount` / `totalDiscountMinor` counters and the Stripe
      // PI all agree even if an admin edits the coupon's amountOff /
      // maxDiscountMinor between preview and apply (the eligibility
      // re-check inside applyToMilestone catches a coupon that was
      // *disabled* in that window).
      const preview = await this.coupons.preview(userId, ownerRole, {
        code: input.couponCode,
        scope: 'MILESTONE',
        amountMinor: milestone.amountCents,
        currency: milestone.contract.currency,
      });
      const couponRow = await this.prisma.coupon.findUnique({
        where: { code: input.couponCode.trim().toUpperCase() },
        select: { id: true },
      });
      if (!couponRow) {
        // Should never happen — preview() just resolved the same code —
        // but surfacing this explicitly keeps the type narrow and avoids
        // a non-null assertion below.
        throw new NotFoundException('Coupon not found');
      }
      chargeAmountCents = preview.finalMinor;
      plannedCoupon = {
        code: input.couponCode,
        couponId: couponRow.id,
        discountMinor: preview.discountMinor,
        finalMinor: preview.finalMinor,
      };
    }

    const pi = await this.stripe.createEscrowPaymentIntent({
      amountCents: chargeAmountCents,
      currency: milestone.contract.currency,
      customerId: customer.id,
      paymentMethodId: input.paymentMethodId,
      description: `Trainova milestone: ${milestone.title}`,
      returnUrl: input.returnUrl,
      metadata: {
        trainovaContractId: milestone.contractId,
        trainovaMilestoneId: milestone.id,
        trainovaCompanyId: milestone.contract.companyId,
        trainovaTrainerId: milestone.contract.trainerId,
        ...(plannedCoupon ? { trainovaCouponId: plannedCoupon.couponId } : {}),
      },
      idempotencyKey: `fund-${milestone.id}-${
        input.couponCode ? input.couponCode.trim().toUpperCase() : 'none'
      }`,
    });

    const mapped = this.mapStripePiStatus(pi.status);
    const receiptUrl = pi.latest_charge
      ? await this.tryGetChargeReceipt(pi.latest_charge as string)
      : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentIntent.upsert({
        where: { stripePaymentIntentId: pi.id },
        create: {
          milestoneId: milestone.id,
          stripePaymentIntentId: pi.id,
          clientSecret: pi.client_secret,
          amountCents: chargeAmountCents,
          currency: milestone.contract.currency,
          status: mapped,
          receiptUrl,
        },
        update: {
          status: mapped,
          clientSecret: pi.client_secret ?? null,
        },
      });
      if (plannedCoupon) {
        await this.coupons.applyToMilestone(tx, {
          code: plannedCoupon.code,
          userId,
          userRole: ownerRole,
          milestoneId: milestone.id,
          originalMinor: milestone.amountCents,
          discountMinor: plannedCoupon.discountMinor,
          finalMinor: plannedCoupon.finalMinor,
          currency: milestone.contract.currency,
        });
      }
    });

    if (mapped === 'SUCCEEDED') {
      // Synchronous success path (e.g. saved card, no 3DS) — flip the
      // milestone immediately instead of waiting for the webhook.
      await this.markMilestoneFunded(milestone.id, pi.id);
    }

    return {
      paymentIntentId: pi.id,
      status: mapped,
      clientSecret: pi.client_secret ?? null,
    };
  }

  async releaseMilestone(
    userId: string,
    milestoneId: string,
    _input: ReleaseMilestoneInput,
  ): Promise<PublicMilestone> {
    const milestone = await this.loadMilestone(milestoneId);
    if (milestone.contract.company.ownerId !== userId) {
      throw new ForbiddenException('Only the owning company can release milestones');
    }
    if (milestone.status !== 'FUNDED') {
      throw new ConflictException(
        `Cannot release milestone in state ${milestone.status} (expected FUNDED)`,
      );
    }
    const connect = milestone.contract.trainer.stripeConnectAccount;
    if (!connect || !connect.payoutsEnabled) {
      throw new BadRequestException(
        'Trainer has not completed Stripe Connect onboarding — payouts cannot be released yet',
      );
    }

    const feeCents = Math.floor(
      (milestone.amountCents * milestone.contract.platformFeeBps) / 10_000,
    );
    const netCents = milestone.amountCents - feeCents;
    if (netCents <= 0) {
      throw new BadRequestException('Net payout after platform fee is zero or negative');
    }

    const transfer = await this.stripe.createTransfer({
      amountCents: netCents,
      currency: milestone.contract.currency,
      destinationAccountId: connect.stripeAccountId,
      description: `Trainova milestone release: ${milestone.title}`,
      metadata: {
        trainovaContractId: milestone.contractId,
        trainovaMilestoneId: milestone.id,
        trainovaTrainerId: milestone.contract.trainerId,
      },
      idempotencyKey: `release-${milestone.id}`,
    });

    const [updated, payout] = await this.prisma.$transaction([
      this.prisma.milestone.update({
        where: { id: milestone.id },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
        },
      }),
      this.prisma.payout.create({
        data: {
          userId: milestone.contract.trainerId,
          milestoneId: milestone.id,
          stripeTransferId: transfer.id,
          amountCents: netCents,
          grossAmountCents: milestone.amountCents,
          feeAmountCents: feeCents,
          taxAmountCents: milestone.taxAmountCents,
          currency: milestone.contract.currency,
          status: 'IN_TRANSIT',
        },
      }),
    ]);

    // Self-billing statement for the trainer — non-fatal if it fails
    // (payout already hit Stripe). Webhook sync or an admin retry can
    // re-issue from the standalone endpoint.
    try {
      await this.invoices.issueForPayout(payout.id);
    } catch (err) {
      this.logger.error(
        `Failed to issue PAYOUT_STATEMENT for payout ${payout.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    void this.webhooks.dispatch(
      milestone.contract.companyId,
      'MILESTONE_RELEASED',
      {
        milestoneId: milestone.id,
        contractId: milestone.contractId,
        amountMinor: milestone.amountCents,
        currency: milestone.contract.currency,
        releasedAt: (updated.releasedAt ?? new Date()).toISOString(),
      },
    );

    // If every milestone is RELEASED/REFUNDED/CANCELLED the contract as
    // a whole is complete.
    await this.maybeCompleteContract(milestone.contractId);

    return this.toPublicMilestone(updated);
  }

  async refundMilestone(
    userId: string,
    milestoneId: string,
    input: RefundMilestoneInput,
  ): Promise<PublicMilestone> {
    const milestone = await this.loadMilestone(milestoneId);
    if (milestone.contract.company.ownerId !== userId) {
      throw new ForbiddenException('Only the owning company can refund milestones');
    }
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

    await this.stripe.refundPaymentIntent({
      paymentIntentId: lastPi.stripePaymentIntentId,
      reason: input.reason,
      idempotencyKey: `refund-${milestone.id}`,
    });

    // Wrap the post-Stripe DB writes in one transaction so the
    // milestone status flip and any coupon-redemption reversal commit
    // atomically. Without the reversal a refunded milestone leaves
    // `redeemedCount` / `perUserLimit` slots consumed forever — see
    // CouponsService.reverseForMilestone for full rationale.
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.coupons.reverseForMilestone(tx, milestone.id);
      return tx.milestone.update({
        where: { id: milestone.id },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
    });
    await this.maybeCompleteContract(milestone.contractId);
    return this.toPublicMilestone(updated);
  }

  // ===================================================================
  // Trainer — Connect onboarding + earnings
  // ===================================================================

  async startConnectOnboarding(
    trainer: { id: string; email: string; name: string },
  ): Promise<{ onboardingUrl: string; accountId: string; status: StripeConnectStatus }> {
    let row = await this.prisma.stripeConnectAccount.findUnique({
      where: { userId: trainer.id },
    });
    if (!row) {
      const account = await this.stripe.createConnectAccount({
        email: trainer.email,
        metadata: { trainerId: trainer.id },
      });
      row = await this.prisma.stripeConnectAccount.create({
        data: {
          userId: trainer.id,
          stripeAccountId: account.id,
          status: 'PENDING',
        },
      });
    }
    const baseUrl = this.stripe.publicWebUrl;
    const link = await this.stripe.createAccountLink({
      accountId: row.stripeAccountId,
      refreshUrl: `${baseUrl}/trainer/earnings?connect=refresh`,
      returnUrl: `${baseUrl}/trainer/earnings?connect=return`,
    });
    return {
      onboardingUrl: link.url,
      accountId: row.stripeAccountId,
      status: row.status,
    };
  }

  async getConnectAccount(
    userId: string,
  ): Promise<PublicStripeConnectAccount | null> {
    const row = await this.prisma.stripeConnectAccount.findUnique({
      where: { userId },
    });
    if (!row) return null;
    return {
      id: row.id,
      stripeAccountId: row.stripeAccountId,
      status: row.status,
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      detailsSubmitted: row.detailsSubmitted,
      country: row.country,
      defaultCurrency: row.defaultCurrency,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    };
  }

  async refreshConnectAccount(userId: string): Promise<PublicStripeConnectAccount | null> {
    const row = await this.prisma.stripeConnectAccount.findUnique({
      where: { userId },
    });
    if (!row) return null;
    const account = await this.stripe.retrieveAccount(row.stripeAccountId);
    const updated = await this.syncConnectAccountFromStripe(account);
    return updated ? this.toPublicConnect(updated) : null;
  }

  async listPayouts(userId: string): Promise<PublicPayout[]> {
    const rows = await this.prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((p) => ({
      id: p.id,
      milestoneId: p.milestoneId,
      amountCents: p.amountCents,
      grossAmountCents: p.grossAmountCents,
      feeAmountCents: p.feeAmountCents,
      taxAmountCents: p.taxAmountCents,
      currency: p.currency,
      status: p.status,
      stripeTransferId: p.stripeTransferId,
      stripePayoutId: p.stripePayoutId,
      failureMessage: p.failureMessage,
      arrivedAt: p.arrivedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  async getEarningsSummary(userId: string): Promise<TrainerEarningsSummary> {
    const [fundedPending, released, payouts] = await Promise.all([
      this.prisma.milestone.findMany({
        where: {
          status: 'FUNDED',
          contract: { trainerId: userId },
        },
        select: { amountCents: true, contract: { select: { platformFeeBps: true } } },
      }),
      this.prisma.milestone.findMany({
        where: {
          status: 'RELEASED',
          contract: { trainerId: userId },
        },
        select: { amountCents: true, contract: { select: { platformFeeBps: true } } },
      }),
      this.prisma.payout.aggregate({
        _sum: { amountCents: true },
        where: { userId, status: 'PAID' },
      }),
    ]);

    // Net-to-trainer = gross milestone amount minus platform fee (same
    // calculation used when funds are released in releaseMilestone).
    // Payouts are recorded at net, so `available = releasedNet - paidOutNet`.
    const netFromMilestones = (
      rows: { amountCents: number; contract: { platformFeeBps: number } }[],
    ) =>
      rows.reduce((acc, r) => {
        const fee = Math.floor((r.amountCents * r.contract.platformFeeBps) / 10_000);
        return acc + (r.amountCents - fee);
      }, 0);

    const pendingNet = netFromMilestones(fundedPending);
    const releasedNet = netFromMilestones(released);
    const paidOut = payouts._sum.amountCents ?? 0;
    return {
      currency: 'USD',
      pendingCents: pendingNet,
      availableCents: Math.max(0, releasedNet - paidOut),
      paidOutCents: paidOut,
      totalEarnedCents: releasedNet,
    };
  }

  // ===================================================================
  // Subscriptions
  // ===================================================================

  /**
   * Ensures the caller has a Stripe Customer record and returns its id.
   * For company owners we cache the customer id on `Company.stripeCustomerId`;
   * for trainers and super-admins we fall back to reusing the id from any
   * previous subscription row (no dedicated column on `User`).
   */
  async ensureStripeCustomerForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
    });
    if (company?.stripeCustomerId) return company.stripeCustomerId;

    const priorSub = await this.prisma.subscription.findFirst({
      where: { userId, stripeCustomerId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    const customer = await this.stripe.ensureCustomer({
      existingId: company?.stripeCustomerId ?? priorSub?.stripeCustomerId ?? null,
      email: user.email,
      name: user.name,
      metadata: { userId: user.id },
    });
    if (company && company.stripeCustomerId !== customer.id) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: { stripeCustomerId: customer.id },
      });
    }
    return customer.id;
  }

  /**
   * Returns a SetupIntent client_secret so the web client can render
   * Stripe Elements' PaymentElement and collect/save a reusable payment
   * method. The same saved payment method is later referenced by
   * `subscribe()` and `fundMilestone()` via its `pm_...` id.
   */
  async createSetupIntentForUser(
    userId: string,
  ): Promise<{ clientSecret: string; publishableKey: string | null }> {
    const customerId = await this.ensureStripeCustomerForUser(userId);
    const si = await this.stripe.createSetupIntent({
      customerId,
      metadata: { userId },
    });
    if (!si.client_secret) {
      throw new BadRequestException('Stripe did not return a SetupIntent client_secret');
    }
    return {
      clientSecret: si.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    };
  }

  async subscribe(
    userId: string,
    input: SubscribePlanInput,
  ): Promise<{
    subscriptionId: string;
    status: string;
    clientSecret: string | null;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.stripePriceId) {
      throw new BadRequestException(
        'Plan is not yet linked to a Stripe price — contact support',
      );
    }

    const existing = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (existing) {
      throw new ConflictException(
        'User already has an active subscription — cancel it before subscribing to a new plan',
      );
    }

    const company = await this.prisma.company.findUnique({ where: { ownerId: userId } });
    const existingCustomerId = company?.stripeCustomerId ?? null;
    const customer = await this.stripe.ensureCustomer({
      existingId: existingCustomerId,
      email: user.email,
      name: user.name,
      metadata: { userId: user.id },
    });
    if (company && customer.id !== existingCustomerId) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    // T7.E — resolve coupon up front so we know which Stripe coupon id
    // to attach to the subscription (Stripe owns the recurring discount;
    // we just mirror it). The CouponRedemption row is written *after*
    // Stripe accepts the subscription in the same DB transaction as
    // our local Subscription row — keeping per-user limits and
    // analytics counters truthful.
    const userRole = await this.getUserRole(userId);
    let stripeCouponId: string | undefined;
    let resolvedCoupon: {
      code: string;
      originalMinor: number;
      discountMinor: number;
      finalMinor: number;
      currency: string;
    } | null = null;
    if (input.couponCode) {
      const resolved = await this.coupons.resolveForSubscription(input.couponCode, {
        userId,
        userRole,
        planId: plan.id,
      });
      stripeCouponId = resolved.stripeCouponId;
      // Subscription plans are denominated in USD on this platform
      // (Plan has no per-row currency column; the web layer formats
      // plan prices with `Intl.NumberFormat('USD')`). Pass that as the
      // *order* currency so `computeCouponDiscount` can reject FIXED
      // coupons whose own currency doesn't match — otherwise the
      // mismatch check is a no-op (coupon.currency vs coupon.currency).
      const planCurrency = 'USD';
      const compute = computeCouponDiscount(
        resolved.coupon,
        plan.priceMonthly,
        planCurrency,
      );
      if (!compute.applicable) {
        throw new BadRequestException(
          compute.reason ?? 'Coupon cannot be applied to this plan',
        );
      }
      resolvedCoupon = {
        code: resolved.coupon.code,
        originalMinor: plan.priceMonthly,
        discountMinor: compute.discountMinor,
        finalMinor: compute.finalMinor,
        currency: planCurrency,
      };
    }

    const subscription = await this.stripe.createSubscription({
      customerId: customer.id,
      priceId: plan.stripePriceId,
      paymentMethodId: input.paymentMethodId,
      metadata: {
        userId: user.id,
        planId: plan.id,
        ...(resolvedCoupon ? { trainovaCouponCode: resolvedCoupon.code } : {}),
      },
      // Coupon code is part of the idempotency key — changing the
      // coupon between attempts changes the discount Stripe applies,
      // and reusing a key with different params is a 400 from Stripe.
      idempotencyKey: `subscribe-${user.id}-${plan.id}-${
        input.couponCode ? input.couponCode.trim().toUpperCase() : 'none'
      }`,
      couponId: stripeCouponId,
    });

    // The Stripe subscription is now live and billing the customer. If
    // the local DB transaction below throws — e.g. `applyToSubscription`
    // detects the coupon's `maxRedemptions` was exhausted, `perUserLimit`
    // was hit, or the coupon was disabled/expired between
    // `resolveForSubscription` and here — we MUST cancel the Stripe
    // subscription so the customer isn't charged for something we have
    // no local record of. Without this compensation the row never
    // appears in the admin panel, billing portal, or cancellation flow,
    // because the webhook handler's `subscription.updateMany` matches
    // zero rows.
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.subscription.create({
          data: {
            userId,
            planId: plan.id,
            status: subscription.status.toUpperCase(),
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customer.id,
            currentPeriodStart: (subscription as unknown as { current_period_start?: number })
              .current_period_start
              ? new Date(
                  ((subscription as unknown as { current_period_start: number })
                    .current_period_start) * 1000,
                )
              : null,
            currentPeriodEnd: (subscription as unknown as { current_period_end?: number })
              .current_period_end
              ? new Date(
                  ((subscription as unknown as { current_period_end: number })
                    .current_period_end) * 1000,
                )
              : null,
          },
        });
        if (resolvedCoupon) {
          await this.coupons.applyToSubscription(tx, {
            code: resolvedCoupon.code,
            userId,
            userRole,
            planId: plan.id,
            subscriptionId: created.id,
            originalMinor: resolvedCoupon.originalMinor,
            discountMinor: resolvedCoupon.discountMinor,
            finalMinor: resolvedCoupon.finalMinor,
            currency: resolvedCoupon.currency,
          });
        }
      });
    } catch (err) {
      try {
        await this.stripe.cancelSubscription(subscription.id, { immediate: true });
      } catch (cancelErr) {
        // Surface both the original cause and the compensation failure
        // — the customer may need a manual refund if Stripe cancel
        // also failed (network blip, etc.).
        this.logger.error(
          `Failed to cancel orphaned Stripe subscription ${subscription.id} after local persistence error`,
          cancelErr instanceof Error ? cancelErr.stack : String(cancelErr),
        );
      }
      throw err;
    }

    const invoice = subscription.latest_invoice as Stripe.Invoice | null | undefined;
    const pi = invoice && typeof invoice !== 'string'
      ? ((invoice as unknown as { payment_intent?: Stripe.PaymentIntent })
          .payment_intent ?? null)
      : null;

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret:
        pi && typeof pi !== 'string'
          ? ((pi as Stripe.PaymentIntent).client_secret ?? null)
          : null,
    };
  }

  async cancelSubscription(userId: string, subscriptionId: string): Promise<void> {
    const row = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!row) throw new NotFoundException('Subscription not found');
    if (!row.stripeSubscriptionId) {
      throw new BadRequestException('Subscription is not linked to Stripe');
    }
    await this.stripe.cancelSubscription(row.stripeSubscriptionId);
    await this.prisma.subscription.update({
      where: { id: row.id },
      data: { cancelAtPeriodEnd: true },
    });
  }

  async createBillingPortal(userId: string): Promise<{ url: string }> {
    const company = await this.prisma.company.findUnique({ where: { ownerId: userId } });
    const customerId = company?.stripeCustomerId;
    if (!customerId) {
      throw new BadRequestException(
        'No Stripe customer on file — subscribe or fund a milestone first',
      );
    }
    const session = await this.stripe.createBillingPortalSession({
      customerId,
      returnUrl: `${this.stripe.publicWebUrl}/company/billing`,
    });
    return { url: session.url };
  }

  // ===================================================================
  // Internal — helpers used by controllers AND webhook handler
  // ===================================================================

  async markMilestoneFunded(milestoneId: string, _paymentIntentId: string): Promise<void> {
    const result = await this.prisma.milestone.updateMany({
      where: { id: milestoneId, status: 'PENDING' },
      data: { status: 'FUNDED', fundedAt: new Date() },
    });
    // Only issue the invoice when we actually transitioned the row —
    // webhook retries otherwise would mint duplicate documents. The
    // invoice service itself is also idempotent on (kind, milestoneId)
    // as a second line of defence.
    if (result.count > 0) {
      try {
        await this.invoices.issueForMilestoneFunding(milestoneId);
      } catch (err) {
        this.logger.error(
          `Failed to issue PURCHASE invoice for milestone ${milestoneId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  async markPaymentIntentStatus(
    stripePaymentIntentId: string,
    status: PaymentIntentStatus,
    failureMessage: string | null = null,
  ): Promise<void> {
    await this.prisma.paymentIntent.updateMany({
      where: { stripePaymentIntentId },
      data: { status, failureMessage },
    });
  }

  async markPayoutStatus(
    stripePayoutId: string,
    status: 'PAID' | 'FAILED' | 'CANCELLED',
    failureMessage: string | null = null,
  ): Promise<void> {
    await this.prisma.payout.updateMany({
      where: { stripePayoutId },
      data: {
        status,
        failureMessage,
        arrivedAt: status === 'PAID' ? new Date() : undefined,
      },
    });
  }

  async syncConnectAccountFromStripe(account: Stripe.Account) {
    const existing = await this.prisma.stripeConnectAccount.findUnique({
      where: { stripeAccountId: account.id },
    });
    if (!existing) return null;
    const status: StripeConnectStatus = account.charges_enabled && account.payouts_enabled
      ? 'ACTIVE'
      : account.requirements?.disabled_reason
        ? 'RESTRICTED'
        : 'PENDING';
    return this.prisma.stripeConnectAccount.update({
      where: { stripeAccountId: account.id },
      data: {
        status,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
        country: account.country ?? null,
        defaultCurrency: account.default_currency ?? null,
        lastSyncedAt: new Date(),
      },
    });
  }

  // ===================================================================
  // Private
  // ===================================================================

  private contractInclude = {
    milestones: { orderBy: { order: 'asc' as const } },
    company: { select: { id: true, name: true, slug: true, logoUrl: true } },
    trainer: { select: { id: true, name: true, avatarUrl: true } },
  } satisfies Prisma.ContractInclude;

  private async loadMilestone(id: string): Promise<MilestoneWithContract> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            company: true,
            trainer: { include: { stripeConnectAccount: true } },
          },
        },
      },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    return milestone as MilestoneWithContract;
  }

  private async maybeCompleteContract(contractId: string): Promise<void> {
    const remaining = await this.prisma.milestone.count({
      where: {
        contractId,
        status: { in: ['PENDING', 'FUNDED'] },
      },
    });
    if (remaining === 0) {
      // updateMany returns the row count; only fan the webhook out
      // if we actually flipped the status this call (otherwise a
      // concurrent release that already completed the contract
      // would re-fire CONTRACT_COMPLETED — the WHERE on `status:
      // 'ACTIVE'` is the dedup guard).
      const claim = await this.prisma.contract.updateMany({
        where: { id: contractId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (claim.count === 1) {
        const completed = await this.prisma.contract.findUnique({
          where: { id: contractId },
          select: {
            id: true,
            companyId: true,
            trainerId: true,
            status: true,
            totalAmountCents: true,
            currency: true,
            completedAt: true,
          },
        });
        if (completed) {
          void this.webhooks.dispatch(
            completed.companyId,
            'CONTRACT_COMPLETED',
            {
              contractId: completed.id,
              companyId: completed.companyId,
              trainerId: completed.trainerId,
              status: completed.status,
              totalMinor: completed.totalAmountCents,
              currency: completed.currency,
              completedAt: (completed.completedAt ?? new Date()).toISOString(),
            },
          );
        }
      }
    }
  }

  private async getUserRole(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!u) throw new NotFoundException('User not found');
    return u.role;
  }

  private async tryGetChargeReceipt(chargeId: string): Promise<string | null> {
    try {
      const charge = await this.stripe.client.charges.retrieve(chargeId);
      return charge.receipt_url ?? null;
    } catch {
      return null;
    }
  }

  private mapStripePiStatus(raw: string): PaymentIntentStatus {
    switch (raw) {
      case 'requires_payment_method':
        return 'REQUIRES_PAYMENT_METHOD';
      case 'requires_confirmation':
        return 'REQUIRES_CONFIRMATION';
      case 'requires_action':
        return 'REQUIRES_ACTION';
      case 'processing':
        return 'PROCESSING';
      case 'requires_capture':
        return 'REQUIRES_CAPTURE';
      case 'succeeded':
        return 'SUCCEEDED';
      case 'canceled':
        return 'CANCELED';
      default:
        return 'FAILED';
    }
  }

  private toPublicContract(row: ContractWithRelations): PublicContract {
    return {
      id: row.id,
      applicationId: row.applicationId,
      companyId: row.companyId,
      trainerId: row.trainerId,
      title: row.title,
      description: row.description,
      currency: row.currency,
      totalAmountCents: row.totalAmountCents,
      subtotalAmountCents: row.subtotalAmountCents,
      taxRateBps: row.taxRateBps,
      taxAmountCents: row.taxAmountCents,
      taxLabel: row.taxLabel,
      taxNote: row.taxNote,
      reverseCharge: row.reverseCharge,
      platformFeeBps: row.platformFeeBps,
      status: row.status,
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      milestones: row.milestones.map((m) => this.toPublicMilestone(m)),
      company: row.company
        ? {
            id: row.company.id,
            name: row.company.name,
            slug: row.company.slug,
            logoUrl: row.company.logoUrl,
          }
        : undefined,
      trainer: row.trainer
        ? {
            id: row.trainer.id,
            name: row.trainer.name,
            avatarUrl: row.trainer.avatarUrl,
          }
        : undefined,
    };
  }

  private toPublicMilestone(m: {
    id: string;
    contractId: string;
    title: string;
    description: string | null;
    amountCents: number;
    subtotalCents: number;
    taxAmountCents: number;
    order: number;
    dueDate: Date | null;
    status: PublicMilestone['status'];
    fundedAt: Date | null;
    releasedAt: Date | null;
    refundedAt: Date | null;
    createdAt: Date;
  }): PublicMilestone {
    return {
      id: m.id,
      contractId: m.contractId,
      title: m.title,
      description: m.description,
      amountCents: m.amountCents,
      subtotalCents: m.subtotalCents,
      taxAmountCents: m.taxAmountCents,
      order: m.order,
      dueDate: m.dueDate?.toISOString() ?? null,
      status: m.status,
      fundedAt: m.fundedAt?.toISOString() ?? null,
      releasedAt: m.releasedAt?.toISOString() ?? null,
      refundedAt: m.refundedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private toPublicConnect(row: {
    id: string;
    stripeAccountId: string;
    status: StripeConnectStatus;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    country: string | null;
    defaultCurrency: string | null;
    lastSyncedAt: Date | null;
  }): PublicStripeConnectAccount {
    return {
      id: row.id,
      stripeAccountId: row.stripeAccountId,
      status: row.status,
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      detailsSubmitted: row.detailsSubmitted,
      country: row.country,
      defaultCurrency: row.defaultCurrency,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    };
  }
}
