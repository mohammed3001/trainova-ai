import { Module } from '@nestjs/common';
import { InvoicingModule } from '../invoicing/invoicing.module';
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
 *
 * T6.C wires InvoicingModule so milestone funding / release mint
 * PURCHASE / PAYOUT_STATEMENT invoices transactionally with the state
 * change, and so contract creation resolves VAT/GST up front.
 */
@Module({
  imports: [PrismaModule, InvoicingModule],
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
