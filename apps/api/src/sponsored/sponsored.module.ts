import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminSponsoredController } from './admin-sponsored.controller';
import { SelfSponsoredController } from './self-sponsored.controller';
import { SponsoredService } from './sponsored.service';

/**
 * T7.G — Sponsored search ranking. See `SponsoredService` for the
 * design rationale and lifecycle. PaymentsModule is imported so we can
 * reuse the Stripe customer + PaymentIntent helpers without duplicating
 * the Stripe wrapper.
 */
@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [AdminSponsoredController, SelfSponsoredController],
  providers: [SponsoredService],
  exports: [SponsoredService],
})
export class SponsoredModule {}
