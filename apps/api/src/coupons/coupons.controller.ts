import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  previewCouponSchema,
  type PreviewCouponInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CouponsService } from './coupons.service';

/**
 * Public-ish coupon endpoints. Authenticated buyers (companies funding
 * milestones / subscribing) hit `POST /coupons/preview` from checkout to
 * confirm a code is valid + see the resulting discount before they
 * commit. The actual application happens server-side from the payments
 * service inside the same DB transaction as the milestone/subscription
 * write.
 */
@ApiTags('coupons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(private readonly service: CouponsService) {}

  @Post('preview')
  preview(
    @Body(new ZodValidationPipe(previewCouponSchema))
    body: PreviewCouponInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.preview(user.id, user.role, body);
  }
}
