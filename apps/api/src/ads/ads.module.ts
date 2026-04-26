import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RetargetingModule } from '../retargeting/retargeting.module';
import { AdminAdsController } from './admin-ads.controller';
import { AdsService } from './ads.service';
import { AdvertiserAdsController } from './advertiser.controller';
import { PublicAdsController } from './public-ads.controller';

/**
 * T4.D — self-serve ad campaigns + admin review + public ad serving.
 *
 *   - PaymentsModule: top-ups reuse the Stripe client and the shared
 *     `ensureStripeCustomerForUser` logic.
 *   - RetargetingModule (T9.G): `PublicAdsController` resolves the
 *     visitor's audience-segment memberships before each `/ads/serve`
 *     call so `AdsService.serveAds` can apply the retargeting filter.
 */
@Module({
  imports: [PrismaModule, PaymentsModule, RetargetingModule],
  controllers: [AdvertiserAdsController, AdminAdsController, PublicAdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
