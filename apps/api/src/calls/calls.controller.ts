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
  createCallSchema,
  endCallSchema,
  listCallsQuerySchema,
  type CreateCallInput,
  type EndCallInput,
  type ListCallsQuery,
} from '@trainova/shared';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CallsService } from './calls.service';
import { CallsGateway } from './calls.gateway';

/**
 * T8.B — voice/video call signaling endpoints. Authorization is anchored
 * to `ConversationParticipant` (see `CallsService`) so this controller
 * only enforces JWT auth at the edge. The WS gateway broadcasts state
 * transitions to other participants in real time.
 */
@ApiTags('calls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(
    private readonly service: CallsService,
    private readonly gateway: CallsGateway,
  ) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createCallSchema))
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateCallInput) {
    const { isNew, ...session } = await this.service.create(user.id, body);
    // Only broadcast `call:incoming` for genuinely new calls. The
    // initiator re-arming the UI on an existing RINGING/ACTIVE call
    // (`isNew=false`) must not re-ring the other side.
    if (isNew) {
      this.gateway.emitIncoming(session.call);
    }
    return session;
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listCallsQuerySchema)) query: ListCallsQuery,
  ) {
    return this.service.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getById(user.id, id);
  }

  @Post(':id/accept')
  async accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const session = await this.service.accept(user.id, id);
    this.gateway.emitAccepted(session.call.conversationId, id, user.id);
    return session;
  }

  @Post(':id/reject')
  async reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const dto = await this.service.reject(user.id, id);
    this.gateway.emitRejected(dto.conversationId, id, user.id);
    this.gateway.emitEnded(dto.conversationId, id, user.id, dto.endReason);
    return dto;
  }

  @Post(':id/end')
  @UsePipes(new ZodValidationPipe(endCallSchema))
  async end(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: EndCallInput,
  ) {
    const dto = await this.service.end(user.id, id, body);
    this.gateway.emitEnded(dto.conversationId, id, user.id, dto.endReason);
    return dto;
  }
}
