import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
