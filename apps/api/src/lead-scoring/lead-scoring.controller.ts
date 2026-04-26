import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { leadScoringQuerySchema, type LeadScoringQuery } from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LeadScoringService } from './lead-scoring.service';

@ApiBearerAuth()
@ApiTags('lead-scoring')
@Controller('lead-scoring')
export class LeadScoringController {
  constructor(private readonly leadScoring: LeadScoringService) {}

  /**
   * Score one application. Trainer can read their own; company-side reads
   * require ownership/membership of the request's company.
   */
  @Get('applications/:id')
  @UseGuards(JwtAuthGuard)
  scoreApplication(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leadScoring.scoreApplication(id, user.id);
  }

  /**
   * Sorted "most likely to hire" feed for a single request. Read-restricted
   * to the request's company owner / member.
   */
  @Get('requests/:id/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER', 'COMPANY_MEMBER')
  @UsePipes(new ZodValidationPipe(leadScoringQuerySchema))
  scoreRequestApplications(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: LeadScoringQuery,
  ) {
    return this.leadScoring.scoreRequestApplications(id, user.id, {
      limit: query.limit,
      minScore: query.minScore,
    });
  }
}
