import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import StripeClient from 'stripe';
import type { Stripe } from 'stripe/cjs/stripe.core.js';

/**
 * Thin wrapper around the Stripe SDK. Centralises:
 *   - lazy-loading the singleton Stripe client (so unit tests that never
 *     touch payments don't require STRIPE_SECRET_KEY to be set),
 *   - webhook signature verification,
 *   - friendly errors for the common "payments not configured" dev case.
 *
 * All money amounts passed to / received from this class are **in the
 * smallest currency unit** (cents for USD/EUR/GBP, halalas for SAR, etc.)
 * to match Stripe's wire format exactly.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private _client: Stripe | null = null;

  private readonly apiVersion = '2026-04-22.dahlia' as const;

  get isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  get client(): Stripe {
    if (this._client) return this._client;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new ServiceUnavailableException(
        'Payments are not configured on this deployment (missing STRIPE_SECRET_KEY).',
      );
    }
    this._client = new StripeClient(key, {
      apiVersion: this.apiVersion,
      appInfo: { name: 'trainova-ai', version: '0.1.0' },
      // Stripe SDK retries idempotent requests on its own; we keep the
      // default to avoid hammering on transient 5xxs.
      maxNetworkRetries: 2,
      timeout: 30_000,
    });
    return this._client;
  }

  /** Issued on every webhook delivery — required to verify signatures. */
  get webhookSecret(): string | null {
    return process.env.STRIPE_WEBHOOK_SECRET ?? null;
  }

  /** Base URL used when building OAuth / Account Link return targets. */
  get publicWebUrl(): string {
    return (
      process.env.PUBLIC_WEB_URL ??
      process.env.WEB_BASE_URL ??
      'http://localhost:3000'
    );
  }

  /**
   * Validates an incoming webhook signature against the raw request
   * body and returns the parsed event. Throws if the signature is
   * missing, malformed, or doesn't verify — controllers should let the
   * exception bubble so Stripe retries automatically.
   */
  constructEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    const secret = this.webhookSecret;
    if (!secret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured (STRIPE_WEBHOOK_SECRET).',
      );
    }
    return this.client.webhooks.constructEvent(rawBody, signature, secret);
  }

  // ---------- Customers ----------

  async ensureCustomer(params: {
    existingId: string | null;
    email: string;
    name: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    if (params.existingId) {
      try {
        const existing = await this.client.customers.retrieve(params.existingId);
        if (!existing.deleted) return existing as Stripe.Customer;
      } catch (err) {
        this.logger.warn(
          `Stripe customer ${params.existingId} unreachable — recreating: ${
            (err as Error).message
          }`,
        );
      }
    }
    return this.client.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    });
  }

  /**
   * SetupIntent used by the Stripe Elements PaymentElement on the
   * frontend to collect and save a card (or other payment method) for
   * off-session reuse — i.e. future subscription charges and milestone
   * fundings. Returns both the id (for idempotency-aware clients) and
   * the client_secret (what the browser actually needs).
   */
  async createSetupIntent(params: {
    customerId: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.SetupIntent> {
    return this.client.setupIntents.create({
      customer: params.customerId,
      usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      metadata: params.metadata,
    });
  }

  // ---------- Connect (trainer payouts) ----------

  async createConnectAccount(params: {
    email: string;
    country?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Account> {
    return this.client.accounts.create({
      type: 'express',
      email: params.email,
      country: params.country,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      metadata: params.metadata,
    });
  }

  async createAccountLink(params: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<Stripe.AccountLink> {
    return this.client.accountLinks.create({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: 'account_onboarding',
    });
  }

  async retrieveAccount(accountId: string): Promise<Stripe.Account> {
    return this.client.accounts.retrieve(accountId);
  }

  // ---------- PaymentIntents (escrow funding) ----------

  async createEscrowPaymentIntent(params: {
    amountCents: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    description: string;
    returnUrl?: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: params.currency.toLowerCase(),
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        confirm: true,
        off_session: false,
        // Money stays on the platform until we decide to release — this
        // is the core of our escrow model. A Transfer later moves funds
        // to the trainer's Connect account (see releaseMilestone).
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: params.description,
        metadata: params.metadata,
        return_url: params.returnUrl,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.retrieve(paymentIntentId);
  }

  async refundPaymentIntent(params: {
    paymentIntentId: string;
    reason?: string;
    idempotencyKey: string;
  }): Promise<Stripe.Refund> {
    return this.client.refunds.create(
      {
        payment_intent: params.paymentIntentId,
        reason: 'requested_by_customer',
        metadata: params.reason ? { note: params.reason.slice(0, 500) } : undefined,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  // ---------- Transfers (release to trainer) ----------

  async createTransfer(params: {
    amountCents: number;
    currency: string;
    destinationAccountId: string;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<Stripe.Transfer> {
    return this.client.transfers.create(
      {
        amount: params.amountCents,
        currency: params.currency.toLowerCase(),
        destination: params.destinationAccountId,
        description: params.description,
        metadata: params.metadata,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  // ---------- Subscriptions ----------

  async createSubscription(params: {
    customerId: string;
    priceId: string;
    paymentMethodId?: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
    /** Stripe coupon id (T7.E) — recurring discount mirrored to Stripe. */
    couponId?: string;
  }): Promise<Stripe.Subscription> {
    if (params.paymentMethodId) {
      await this.client.paymentMethods.attach(params.paymentMethodId, {
        customer: params.customerId,
      });
      await this.client.customers.update(params.customerId, {
        invoice_settings: { default_payment_method: params.paymentMethodId },
      });
    }
    const createParams: Stripe.SubscriptionCreateParams = {
      customer: params.customerId,
      items: [{ price: params.priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: params.metadata,
    };
    if (params.couponId) {
      createParams.discounts = [{ coupon: params.couponId }];
    }
    return this.client.subscriptions.create(createParams, {
      idempotencyKey: params.idempotencyKey,
    });
  }

  async cancelSubscription(
    subscriptionId: string,
    options: { immediate?: boolean } = {},
  ): Promise<Stripe.Subscription> {
    if (options.immediate) {
      return this.client.subscriptions.cancel(subscriptionId);
    }
    return this.client.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async createBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<Stripe.BillingPortal.Session> {
    return this.client.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
  }
}
