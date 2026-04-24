import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AD_CAMPAIGN_STATUSES,
  rejectCampaignInputSchema,
  type AdCampaignStatus,
  type RejectCampaignInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdsService } from './ads.service';

@ApiTags('ads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/ads')
export class AdminAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get('pending')
  @Roles('ADMIN', 'SUPER_ADMIN')
  listPending() {
    return this.ads.listPendingForAdmin();
  }

  @Get('all')
  @Roles('ADMIN', 'SUPER_ADMIN')
  listAll(@Query('status') status?: string) {
    const filter =
      status && (AD_CAMPAIGN_STATUSES as readonly string[]).includes(status)
        ? (status as AdCampaignStatus)
        : undefined;
    return this.ads.listAllForAdmin(filter);
  }

  @Post(':id/approve')
  @Roles('ADMIN', 'SUPER_ADMIN')
  approve(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.ads.approveCampaign(admin.id, id);
  }

  @Post(':id/reject')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(rejectCampaignInputSchema))
  reject(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() body: RejectCampaignInput,
  ) {
    return this.ads.rejectCampaign(admin.id, id, body);
  }

  @Post(':id/pause')
  @Roles('ADMIN', 'SUPER_ADMIN')
  pause(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.ads.pauseCampaign(admin.id, id, true);
  }

  @Post(':id/resume')
  @Roles('ADMIN', 'SUPER_ADMIN')
  resume(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.ads.resumeCampaign(admin.id, id, true);
  }
}
