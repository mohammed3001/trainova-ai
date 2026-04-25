import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  cancelInterviewSchema,
  completeInterviewSchema,
  createInterviewSchema,
  listInterviewsQuerySchema,
  rescheduleInterviewSchema,
  type CancelInterviewInput,
  type CompleteInterviewInput,
  type CreateInterviewInput,
  type ListInterviewsQuery,
  type RescheduleInterviewInput,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InterviewsService } from './interviews.service';

@ApiTags('interviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly service: InterviewsService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createInterviewSchema))
  create(@CurrentUser() user: AuthUser, @Body() body: CreateInterviewInput) {
    return this.service.create(user.id, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listInterviewsQuerySchema)) query: ListInterviewsQuery,
  ) {
    return this.service.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getById(user.id, id);
  }

  @Patch(':id/reschedule')
  @UsePipes(new ZodValidationPipe(rescheduleInterviewSchema))
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RescheduleInterviewInput,
  ) {
    return this.service.reschedule(user.id, id, body);
  }

  @Post(':id/cancel')
  @UsePipes(new ZodValidationPipe(cancelInterviewSchema))
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CancelInterviewInput,
  ) {
    return this.service.cancel(user.id, id, body);
  }

  @Post(':id/complete')
  @UsePipes(new ZodValidationPipe(completeInterviewSchema))
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CompleteInterviewInput,
  ) {
    return this.service.complete(user.id, id, body);
  }
}
