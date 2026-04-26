import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { TestsModule } from '../tests/tests.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [TestsModule, NotificationsModule, FraudModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
