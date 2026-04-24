import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createCampaignInputSchema,
  createCreativeInputSchema,
  topupCampaignInputSchema,
  updateCampaignInputSchema,
  updateCreativeInputSchema,
  type CreateCampaignInput,
  type CreateCreativeInput,
  type TopupCampaignInput,
  type UpdateCampaignInput,
  type UpdateCreativeInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdsService } from './ads.service';

/**
 * Advertiser self-serve endpoints. Any user with COMPANY_OWNER or
 * ADMIN role can manage their own campaigns. Trainers can't publish
 * ads on the current plan.
 */
@ApiTags('ads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ads')
export class AdvertiserAdsController {
  constructor(private readonly ads: AdsService) {}

  @Post('campaigns')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(createCampaignInputSchema))
  createCampaign(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateCampaignInput,
  ) {
    return this.ads.createCampaign(user.id, body);
  }

  @Get('campaigns/mine')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  listMine(@CurrentUser() user: AuthUser) {
    return this.ads.listMyCampaigns(user.id);
  }

  @Get('campaigns/:id')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  getCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ads.getCampaign(user.id, id);
  }

  @Patch('campaigns/:id')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(updateCampaignInputSchema))
  updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateCampaignInput,
  ) {
    return this.ads.updateCampaign(user.id, id, body);
  }

  @Delete('campaigns/:id')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  deleteCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ads.deleteCampaign(user.id, id);
  }

  @Post('campaigns/:id/submit')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  submitCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ads.submitCampaign(user.id, id);
  }

  @Post('campaigns/:id/pause')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  pauseCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    return this.ads.pauseCampaign(user.id, id, isAdmin);
  }

  @Post('campaigns/:id/resume')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  resumeCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    return this.ads.resumeCampaign(user.id, id, isAdmin);
  }

  @Post('campaigns/:id/creatives')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(createCreativeInputSchema))
  addCreative(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateCreativeInput,
  ) {
    return this.ads.addCreative(user.id, id, body);
  }

  @Patch('creatives/:id')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(updateCreativeInputSchema))
  updateCreative(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateCreativeInput,
  ) {
    return this.ads.updateCreative(user.id, id, body);
  }

  @Delete('creatives/:id')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  deleteCreative(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ads.deleteCreative(user.id, id);
  }

  @Post('campaigns/:id/topup')
  @Roles('COMPANY_OWNER', 'ADMIN', 'SUPER_ADMIN')
  @UsePipes(new ZodValidationPipe(topupCampaignInputSchema))
  topupCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: TopupCampaignInput,
  ) {
    return this.ads.startTopup(user.id, id, body);
  }
}
