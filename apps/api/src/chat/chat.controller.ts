import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { sendMessageSchema, startConversationSchema, type SendMessageInput, type StartConversationInput } from '@trainova/shared';
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

  @Post('conversations')
  @UsePipes(new ZodValidationPipe(startConversationSchema))
  start(@CurrentUser() user: AuthUser, @Body() body: StartConversationInput) {
    return this.service.startConversation(user.id, body);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listMessages(user.id, id);
  }

  @Post('messages')
  @UsePipes(new ZodValidationPipe(sendMessageSchema))
  send(@CurrentUser() user: AuthUser, @Body() body: SendMessageInput) {
    return this.service.sendMessage(user.id, body);
  }
}
