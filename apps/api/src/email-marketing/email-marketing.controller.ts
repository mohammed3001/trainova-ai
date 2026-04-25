import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateEmailCampaignSchema,
  CreateEmailDripSequenceSchema,
  CreateEmailDripStepSchema,
  EnrollDripSchema,
  ListDripEnrollmentsQuerySchema,
  ListEmailCampaignsQuerySchema,
  ScheduleEmailCampaignSchema,
  SegmentPreviewQuerySchema,
  UpdateEmailCampaignSchema,
  UpdateEmailDripSequenceSchema,
  UpdateEmailDripStepSchema,
  type CreateEmailCampaignInput,
  type CreateEmailDripSequenceInput,
  type CreateEmailDripStepInput,
  type EnrollDripInput,
  type ListDripEnrollmentsQuery,
  type ListEmailCampaignsQuery,
  type ScheduleEmailCampaignInput,
  type SegmentPreviewQuery,
  type UpdateEmailCampaignInput,
  type UpdateEmailDripSequenceInput,
  type UpdateEmailDripStepInput,
} from '@trainova/shared';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EmailMarketingService } from './email-marketing.service';

interface RequestWithUser extends Request {
  user?: { id: string };
}

/**
 * Admin email marketing surface. Locked to roles allowed to manage outbound
 * communications. CONTENT_MANAGER is included so a non-finance editor can
 * still author marketing copy without touching billing.
 */
@ApiTags('email-marketing')
@Controller('admin/email')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class EmailMarketingController {
  constructor(private readonly svc: EmailMarketingService) {}

  // -------- Campaigns --------

  @Get('campaigns')
  @UsePipes(new ZodValidationPipe(ListEmailCampaignsQuerySchema))
  listCampaigns(@Query() q: ListEmailCampaignsQuery) {
    return this.svc.listCampaigns(q);
  }

  @Get('campaigns/segment-preview')
  @UsePipes(new ZodValidationPipe(SegmentPreviewQuerySchema))
  previewSegment(@Query() q: SegmentPreviewQuery) {
    const segment = this.svc.parseSegmentJson(q.segment);
    return this.svc.previewSegment(segment);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string) {
    return this.svc.getCampaign(id);
  }

  @Post('campaigns')
  @UsePipes(new ZodValidationPipe(CreateEmailCampaignSchema))
  createCampaign(@Body() body: CreateEmailCampaignInput, @Req() req: RequestWithUser) {
    return this.svc.createCampaign(body, req.user!.id);
  }

  @Patch('campaigns/:id')
  @UsePipes(new ZodValidationPipe(UpdateEmailCampaignSchema))
  updateCampaign(@Param('id') id: string, @Body() body: UpdateEmailCampaignInput) {
    return this.svc.updateCampaign(id, body);
  }

  @Delete('campaigns/:id')
  @HttpCode(204)
  async deleteCampaign(@Param('id') id: string) {
    await this.svc.deleteCampaign(id);
  }

  @Post('campaigns/:id/schedule')
  @UsePipes(new ZodValidationPipe(ScheduleEmailCampaignSchema))
  scheduleCampaign(@Param('id') id: string, @Body() body: ScheduleEmailCampaignInput) {
    return this.svc.scheduleCampaign(id, new Date(body.scheduledFor));
  }

  @Post('campaigns/:id/cancel')
  cancelCampaign(@Param('id') id: string) {
    return this.svc.cancelCampaign(id);
  }

  @Post('campaigns/:id/send-now')
  sendCampaignNow(@Param('id') id: string) {
    return this.svc.sendCampaignNow(id);
  }

  // -------- Drip sequences --------

  @Get('drip')
  listDripSequences() {
    return this.svc.listDripSequences();
  }

  @Get('drip/enrollments')
  @UsePipes(new ZodValidationPipe(ListDripEnrollmentsQuerySchema))
  listEnrollments(@Query() q: ListDripEnrollmentsQuery) {
    return this.svc.listEnrollments(q);
  }

  @Get('drip/:id')
  getDripSequence(@Param('id') id: string) {
    return this.svc.getDripSequence(id);
  }

  @Post('drip')
  @UsePipes(new ZodValidationPipe(CreateEmailDripSequenceSchema))
  createDripSequence(@Body() body: CreateEmailDripSequenceInput, @Req() req: RequestWithUser) {
    return this.svc.createDripSequence(body, req.user!.id);
  }

  @Patch('drip/:id')
  @UsePipes(new ZodValidationPipe(UpdateEmailDripSequenceSchema))
  updateDripSequence(@Param('id') id: string, @Body() body: UpdateEmailDripSequenceInput) {
    return this.svc.updateDripSequence(id, body);
  }

  @Delete('drip/:id')
  @HttpCode(204)
  async deleteDripSequence(@Param('id') id: string) {
    await this.svc.deleteDripSequence(id);
  }

  @Post('drip/:id/steps')
  @UsePipes(new ZodValidationPipe(CreateEmailDripStepSchema))
  addDripStep(@Param('id') id: string, @Body() body: CreateEmailDripStepInput) {
    return this.svc.addDripStep(id, body);
  }

  @Patch('drip/:id/steps/:stepId')
  @UsePipes(new ZodValidationPipe(UpdateEmailDripStepSchema))
  updateDripStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() body: UpdateEmailDripStepInput,
  ) {
    return this.svc.updateDripStep(id, stepId, body);
  }

  @Delete('drip/:id/steps/:stepId')
  @HttpCode(204)
  async deleteDripStep(@Param('id') id: string, @Param('stepId') stepId: string) {
    await this.svc.deleteDripStep(id, stepId);
  }

  @Post('drip/enroll')
  @UsePipes(new ZodValidationPipe(EnrollDripSchema))
  enrollUser(@Body() body: EnrollDripInput) {
    return this.svc.enrollUser(body.sequenceId, body.userId);
  }

  @Post('drip/enrollments/:id/cancel')
  cancelEnrollment(@Param('id') id: string) {
    return this.svc.cancelEnrollment(id);
  }
}
