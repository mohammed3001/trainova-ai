import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import {
  messageSearchQuerySchema,
  messageTemplateCreateSchema,
  messageTemplateUpdateSchema,
  sendMessageSchema,
  startConversationSchema,
  type MessageSearchQuery,
  type MessageTemplateCreateInput,
  type MessageTemplateUpdateInput,
  type SendMessageInput,
  type StartConversationInput,
} from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ChatService } from './chat.service';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Get('conversations')
  list(@CurrentUser() user: AuthUser) {
    return this.service.listConversations(user.id);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { total: await this.service.totalUnread(user.id) };
  }

  @Post('conversations')
  @UsePipes(new ZodValidationPipe(startConversationSchema))
  start(@CurrentUser() user: AuthUser, @Body() body: StartConversationInput) {
    return this.service.startConversation(user.id, body);
  }

  @Get('conversations/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getConversation(user.id, id);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listMessages(user.id, id);
  }

  @Patch('conversations/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markRead(user.id, id);
  }

  @Post('messages')
  @UsePipes(new ZodValidationPipe(sendMessageSchema))
  send(@CurrentUser() user: AuthUser, @Body() body: SendMessageInput) {
    return this.service.sendMessage(user.id, body);
  }

  // T7.H — search across the caller's conversations.
  @Get('messages/search')
  @UsePipes(new ZodValidationPipe(messageSearchQuerySchema))
  searchMessages(@CurrentUser() user: AuthUser, @Query() q: MessageSearchQuery) {
    return this.service.searchMessages(user.id, q);
  }

  // T7.H — saved chat templates (per-user).
  @Get('templates')
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.service.listTemplates(user.id);
  }

  @Post('templates')
  @UsePipes(new ZodValidationPipe(messageTemplateCreateSchema))
  createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() body: MessageTemplateCreateInput,
  ) {
    return this.service.createTemplate(user.id, body);
  }

  @Patch('templates/:id')
  @UsePipes(new ZodValidationPipe(messageTemplateUpdateSchema))
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: MessageTemplateUpdateInput,
  ) {
    return this.service.updateTemplate(user.id, id, body);
  }

  @Delete('templates/:id')
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteTemplate(user.id, id);
  }
}
