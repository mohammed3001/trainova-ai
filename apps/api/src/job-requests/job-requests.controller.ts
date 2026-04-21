import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { createJobRequestSchema, type CreateJobRequestInput } from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JobRequestsService } from './job-requests.service';

@ApiTags('job-requests')
@Controller('job-requests')
export class JobRequestsController {
  constructor(private readonly service: JobRequestsService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('skill') skill?: string,
    @Query('industry') industry?: string,
    @Query('modelFamily') modelFamily?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listPublic({
      q,
      skill,
      industry,
      modelFamily,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listMine(user.id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  @UsePipes(new ZodValidationPipe(createJobRequestSchema))
  create(@CurrentUser() user: AuthUser, @Body() body: CreateJobRequestInput) {
    return this.service.create(user.id, body);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Get(':id/applications')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_OWNER')
  applications(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.applications(user.id, id);
  }
}
