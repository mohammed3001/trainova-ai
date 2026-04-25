import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  selfPaidCheckoutBodySchema,
  type SelfPaidCheckoutBody,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SponsoredService } from './sponsored.service';

@ApiTags('sponsored')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sponsored')
export class SelfSponsoredController {
  constructor(private readonly service: SponsoredService) {}

  /**
   * Owner-driven self-paid sponsored placement checkout. The body
   * carries a tokenised `paymentMethodId` (saved card) — never raw card
   * data. The response returns the Stripe `clientSecret` so the SPA can
   * confirm the PaymentIntent in-browser via Stripe Elements.
   */
  @Post('checkout')
  @UsePipes(new ZodValidationPipe(selfPaidCheckoutBodySchema))
  checkout(@CurrentUser() user: AuthUser, @Body() body: SelfPaidCheckoutBody) {
    const { paymentMethodId, ...input } = body;
    return this.service.selfPaidCheckout(user.id, input, paymentMethodId);
  }
}
