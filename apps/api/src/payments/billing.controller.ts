import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  subscribePlanInputSchema,
  type SubscribePlanInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('plans')
  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: [{ audience: 'asc' }, { priceMonthly: 'asc' }],
    });
    return plans.map((p) => ({
      id: p.id,
      audience: p.audience,
      tier: p.tier,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      features: p.featuresJson as unknown,
      stripeConfigured: Boolean(p.stripePriceId),
    }));
  }

  @Get('subscription')
  async getSubscription(@CurrentUser() user: AuthUser) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId: user.id, status: { not: 'CANCELED' } },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return null;
    const plan = await this.prisma.plan.findUnique({ where: { id: sub.planId } });
    return {
      id: sub.id,
      planId: sub.planId,
      planTier: plan?.tier ?? null,
      planAudience: plan?.audience ?? null,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  @Post('subscribe')
  @UsePipes(new ZodValidationPipe(subscribePlanInputSchema))
  subscribe(@CurrentUser() user: AuthUser, @Body() body: SubscribePlanInput) {
    return this.payments.subscribe(user.id, body);
  }

  @Delete('subscriptions/:id')
  async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.payments.cancelSubscription(user.id, id);
    return { ok: true };
  }

  @Post('portal')
  portal(@CurrentUser() user: AuthUser) {
    return this.payments.createBillingPortal(user.id);
  }

  /**
   * Returns a SetupIntent client_secret so the web app can mount Stripe
   * Elements and save a reusable payment method. The publishable key is
   * returned alongside as a convenience (it is safe to expose).
   */
  @Post('setup-intent')
  setupIntent(@CurrentUser() user: AuthUser) {
    return this.payments.createSetupIntentForUser(user.id);
  }
}
