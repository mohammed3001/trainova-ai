import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  advanceStageSchema,
  createPipelineSchema,
  rejectStageSchema,
  replaceStagesSchema,
  skipStageSchema,
  updatePipelineSchema,
  type AdvanceStageInput,
  type CreatePipelineInput,
  type RejectStageInput,
  type ReplaceStagesInput,
  type SkipStageInput,
  type UpdatePipelineInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EvaluationPipelinesService } from './evaluation-pipelines.service';

@ApiTags('evaluation-pipelines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EvaluationPipelinesController {
  constructor(private readonly service: EvaluationPipelinesService) {}

  // ----- Pipeline CRUD --------------------------------------------------

  @Post('evaluation-pipelines')
  @UsePipes(new ZodValidationPipe(createPipelineSchema))
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePipelineInput) {
    return this.service.create(user.id, body);
  }

  @Get('job-requests/:requestId/evaluation-pipeline')
  getByRequest(@CurrentUser() user: AuthUser, @Param('requestId') requestId: string) {
    return this.service.getByRequest(user.id, requestId);
  }

  @Patch('evaluation-pipelines/:id')
  @UsePipes(new ZodValidationPipe(updatePipelineSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdatePipelineInput,
  ) {
    return this.service.update(user.id, id, body);
  }

  @Put('evaluation-pipelines/:id/stages')
  @UsePipes(new ZodValidationPipe(replaceStagesSchema))
  replaceStages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ReplaceStagesInput,
  ) {
    return this.service.replaceStages(user.id, id, body);
  }

  @Delete('evaluation-pipelines/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.service.remove(user.id, id);
  }

  // ----- Per-application progress --------------------------------------

  @Get('applications/:applicationId/evaluation-progress')
  getApplicationSnapshot(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
  ) {
    return this.service.getApplicationSnapshot(user.id, applicationId);
  }

  @Post('applications/:applicationId/evaluation-progress')
  startProgress(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
  ) {
    return this.service.startProgress(user.id, applicationId);
  }

  @Post('evaluation-progress/:progressId/advance')
  @UsePipes(new ZodValidationPipe(advanceStageSchema))
  advance(
    @CurrentUser() user: AuthUser,
    @Param('progressId') progressId: string,
    @Body() body: AdvanceStageInput,
  ) {
    return this.service.advanceStage(user.id, progressId, body);
  }

  @Post('evaluation-progress/:progressId/reject')
  @UsePipes(new ZodValidationPipe(rejectStageSchema))
  reject(
    @CurrentUser() user: AuthUser,
    @Param('progressId') progressId: string,
    @Body() body: RejectStageInput,
  ) {
    return this.service.rejectStage(user.id, progressId, body);
  }

  @Post('evaluation-progress/:progressId/skip')
  @UsePipes(new ZodValidationPipe(skipStageSchema))
  skip(
    @CurrentUser() user: AuthUser,
    @Param('progressId') progressId: string,
    @Body() body: SkipStageInput,
  ) {
    return this.service.skipStage(user.id, progressId, body);
  }

  @Post('evaluation-progress/:progressId/withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Param('progressId') progressId: string) {
    return this.service.withdrawProgress(user.id, progressId);
  }
}
