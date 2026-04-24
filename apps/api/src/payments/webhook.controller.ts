import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Stripe } from 'stripe/cjs/stripe.core.js';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { AdsService } from '../ads/ads.service';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

/**
 * Incoming Stripe webhook deliveries. Swagger-excluded because Stripe
 * calls it directly, not the SPA.
 *
 * Idempotency: every `event.id` we process is persisted to
 * `StripeWebhookEvent`; replays become no-ops. Signature verification
 * uses the raw request body (see `main.ts` for the raw-body hook).
 */
@ApiExcludeController()
@Controller('payments/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * AdsService is resolved lazily to avoid a circular module graph:
   * `AdsModule -> PaymentsModule -> AdsModule`. Webhook deliveries are
   * the only place PaymentsModule needs to see ads, and by the time a
   * request arrives the full container is wired.
   */
  private ads(): AdsService {
    return this.moduleRef.get(AdsService, { strict: false });
  }

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true; replay?: true }> {
    if (!signature) throw new BadRequestException('Missing stripe-signature');
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) {
      throw new BadRequestException(
        'Raw body not captured — verify the raw-body middleware is mounted for /payments/webhook',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(raw, signature);
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (existing?.processedAt) {
      // Stripe retries unconfirmed deliveries — swallow replays.
      return { received: true, replay: true };
    }
    await this.prisma.stripeWebhookEvent.upsert({
      where: { stripeEventId: event.id },
      create: {
        stripeEventId: event.id,
        type: event.type,
        payload: event as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });

    try {
      await this.dispatch(event);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: { processedAt: new Date(), errorMessage: null },
      });
    } catch (err) {
      this.logger.error(
        `Webhook dispatch failed for ${event.type} (${event.id})`,
        err as Error,
      );
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: { errorMessage: (err as Error).message },
      });
      throw err;
    }

    return { received: true };
  }

  private async dispatch(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const milestoneId = pi.metadata?.trainovaMilestoneId;
        const adTopupId = pi.metadata?.trainovaAdTopupId;
        await this.payments.markPaymentIntentStatus(pi.id, 'SUCCEEDED');
        if (milestoneId) await this.payments.markMilestoneFunded(milestoneId, pi.id);
        if (adTopupId) await this.ads().handleTopupSucceeded(pi.id);
        return;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const adTopupId = pi.metadata?.trainovaAdTopupId;
        await this.payments.markPaymentIntentStatus(
          pi.id,
          'FAILED',
          pi.last_payment_error?.message ?? 'payment_intent.payment_failed',
        );
        if (adTopupId) {
          await this.ads().handleTopupFailed(
            pi.id,
            pi.last_payment_error?.message ?? null,
          );
        }
        return;
      }
      case 'payment_intent.canceled': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.payments.markPaymentIntentStatus(pi.id, 'CANCELED');
        return;
      }
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await this.payments.syncConnectAccountFromStripe(account);
        return;
      }
      case 'payout.paid': {
        const payout = event.data.object as Stripe.Payout;
        await this.payments.markPayoutStatus(payout.id, 'PAID');
        return;
      }
      case 'payout.failed': {
        const payout = event.data.object as Stripe.Payout;
        await this.payments.markPayoutStatus(
          payout.id,
          'FAILED',
          payout.failure_message ?? 'payout.failed',
        );
        return;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status: sub.status.toUpperCase(),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: (sub as unknown as { current_period_start?: number })
              .current_period_start
              ? new Date(
                  ((sub as unknown as { current_period_start: number })
                    .current_period_start) * 1000,
                )
              : undefined,
            currentPeriodEnd: (sub as unknown as { current_period_end?: number })
              .current_period_end
              ? new Date(
                  ((sub as unknown as { current_period_end: number })
                    .current_period_end) * 1000,
                )
              : undefined,
          },
        });
        return;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: 'CANCELED', cancelAtPeriodEnd: false },
        });
        return;
      }
      default:
        // Unknown event types are fine — Stripe delivers many we don't care
        // about. Record and mark processed so they don't requeue forever.
        return;
    }
  }
}

