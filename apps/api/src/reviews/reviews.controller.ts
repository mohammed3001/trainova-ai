import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  reviewListQuerySchema,
  submitReviewInputSchema,
  type ReviewListQuery,
  type SubmitReviewInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('trainers/:slug/reviews')
  listForTrainer(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(reviewListQuerySchema)) query: ReviewListQuery,
  ) {
    return this.reviews.listForTrainer(slug, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER', 'TRAINER')
  @Post('reviews')
  @UsePipes(new ZodValidationPipe(submitReviewInputSchema))
  submit(@CurrentUser() user: AuthUser, @Body() body: SubmitReviewInput) {
    return this.reviews.submit(user.id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER', 'TRAINER')
  @Get('reviews/me/eligible')
  eligible(@CurrentUser() user: AuthUser) {
    return this.reviews.listEligibleForActor(user.id);
  }
}
