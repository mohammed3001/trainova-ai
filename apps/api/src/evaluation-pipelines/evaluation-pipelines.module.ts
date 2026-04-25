import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EvaluationPipelinesController } from './evaluation-pipelines.controller';
import { EvaluationPipelinesService } from './evaluation-pipelines.service';

/**
 * T8.D — Multi-stage evaluation pipelines. Authorization is anchored
 * to the underlying `JobRequest.company.ownerId` (matches the existing
 * job-requests module convention); applicants only see their own
 * progress snapshot. Notifications are fanned-out via
 * `NotificationsService.emit()` whenever a stage advances or closes.
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [EvaluationPipelinesController],
  providers: [EvaluationPipelinesService],
  exports: [EvaluationPipelinesService],
})
export class EvaluationPipelinesModule {}
