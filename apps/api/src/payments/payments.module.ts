import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { ContractsController } from './contracts.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { TrainerPaymentsController } from './trainer-payments.controller';
import { StripeWebhookController } from './webhook.controller';

/**
 * T4.C — escrow contracts, milestones, trainer payouts, subscriptions.
 * All controllers share the single PaymentsService / StripeService so
 * idempotency keys and Stripe state stay consistent across call sites.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    ContractsController,
    BillingController,
    TrainerPaymentsController,
    StripeWebhookController,
  ],
  providers: [StripeService, PaymentsService],
  exports: [StripeService, PaymentsService],
})
export class PaymentsModule {}
