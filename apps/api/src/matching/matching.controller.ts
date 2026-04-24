import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { matchingQuerySchema, type MatchingQuery } from '@trainova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from './matching.service';

@ApiBearerAuth()
@ApiTags('matching')
@Controller()
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Trainer's "Recommended for you" feed.
   */
  @Get('matching/me/recommended-jobs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TRAINER')
  @UsePipes(new ZodValidationPipe(matchingQuerySchema))
  recommendJobs(@CurrentUser() user: AuthUser, @Query() query: MatchingQuery) {
    return this.matching.recommendJobsForTrainer(user.id, {
      limit: query.limit,
      minScore: query.minScore,
    });
  }

  /**
   * Company shortlist for one of their own job requests. Anyone in the owning
   * company (owner or member) can read; otherwise 403.
   */
  @Get('company/requests/:id/suggested-trainers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER', 'COMPANY_MEMBER')
  @UsePipes(new ZodValidationPipe(matchingQuerySchema))
  async companySuggested(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: MatchingQuery,
  ) {
    const job = await this.prisma.jobRequest.findUnique({
      where: { id },
      select: {
        company: {
          select: {
            ownerId: true,
            members: { where: { userId: user.id }, select: { id: true } },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('Job request not found');
    const isOwner = job.company.ownerId === user.id;
    const isMember = job.company.members.length > 0;
    if (!isOwner && !isMember) {
      throw new ForbiddenException('Not part of the owning company');
    }
    return this.matching.recommendTrainersForJob(id, {
      limit: query.limit,
      minScore: query.minScore,
    });
  }

  /**
   * Admin view: top trainer matches for any request.
   */
  @Get('admin/matching/requests/:id/trainers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @UsePipes(new ZodValidationPipe(matchingQuerySchema))
  adminMatches(@Param('id') id: string, @Query() query: MatchingQuery) {
    return this.matching.recommendTrainersForJob(id, {
      limit: query.limit,
      minScore: query.minScore,
    });
  }
}
