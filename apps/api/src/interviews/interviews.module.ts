import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

/**
 * T8.C — Interview scheduling. Authorization is anchored to the chat
 * conversation (see `InterviewsService.loadConversationContext`), so we
 * import `NotificationsModule` to fan-out a bell + email to the
 * non-acting participant on every state change.
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
