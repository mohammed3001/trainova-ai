import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_ROLE_GROUPS,
  audienceSegmentCreateSchema,
  audienceSegmentUpdateSchema,
  type AudienceSegmentCreateInput,
  type AudienceSegmentUpdateInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RetargetingService } from './retargeting.service';

/**
 * Admin CRUD on `AudienceSegment`. Audience segments are an ad-targeting
 * facet, so the access policy mirrors `AdminAdsController` —
 * `ADMIN_ROLE_GROUPS.ADS` (super-admin, admin, ads-manager).
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLE_GROUPS.ADS)
@Controller('admin/retargeting/segments')
export class AdminRetargetingController {
  constructor(private readonly service: RetargetingService) {}

  @Get()
  list() {
    return this.service.listSegments();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getSegment(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(audienceSegmentCreateSchema))
    body: AudienceSegmentCreateInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createSegment(body, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(audienceSegmentUpdateSchema))
    body: AudienceSegmentUpdateInput,
  ) {
    return this.service.updateSegment(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.deleteSegment(id);
  }

  /**
   * Force-recompute one segment's membership now (admin preview after a
   * definition change). Bypasses the cron debounce. Returns the new
   * member count.
   */
  @Post(':id/recompute')
  recompute(@Param('id') id: string) {
    return this.service.recomputeSegmentNow(id);
  }
}
