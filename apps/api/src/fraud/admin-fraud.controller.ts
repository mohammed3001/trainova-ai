import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ADMIN_ROLE_GROUPS,
  fraudListQuerySchema,
  fraudReviewSchema,
  type FraudListQuery,
  type FraudReviewInput,
} from '@trainova/shared';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FraudService } from './fraud.service';

interface RequestWithUser extends Request {
  user?: { id: string };
}

/**
 * Admin fraud-review surface (T9.D). Locked to MODERATION because risk
 * review is a moderation activity — finance/content/ads roles do not need
 * sight of trainer flags.
 */
@ApiTags('admin-fraud')
@Controller('admin/fraud')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.MODERATION)
export class AdminFraudController {
  constructor(private readonly svc: FraudService) {}

  @Get('applications')
  @UsePipes(new ZodValidationPipe(fraudListQuerySchema))
  list(@Query() q: FraudListQuery) {
    return this.svc.listForReview({
      level: q.level,
      onlyUnreviewed: q.onlyUnreviewed,
      take: q.limit,
      cursor: q.cursor,
    });
  }

  @Post('applications/:id/rescore')
  rescore(@Param('id') id: string) {
    return this.svc.scoreApplicationOrThrow(id);
  }

  @Post('applications/:id/review')
  review(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(fraudReviewSchema)) body: FraudReviewInput,
    @Req() req: RequestWithUser,
  ) {
    const adminId = req.user?.id ?? '';
    return this.svc.markReviewed({ applicationId: id, adminId, note: body.note ?? null });
  }

  @Delete('applications/:id/review')
  clear(@Param('id') id: string) {
    return this.svc.clearReview(id);
  }
}
