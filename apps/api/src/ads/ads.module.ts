import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAdsController } from './admin-ads.controller';
import { AdsService } from './ads.service';
import { AdvertiserAdsController } from './advertiser.controller';
import { PublicAdsController } from './public-ads.controller';

/**
 * T4.D — self-serve ad campaigns + admin review + public ad serving.
 * Imports PaymentsModule so top-ups can reuse the Stripe client and
 * the shared `ensureStripeCustomerForUser` logic.
 */
@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [AdvertiserAdsController, AdminAdsController, PublicAdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
