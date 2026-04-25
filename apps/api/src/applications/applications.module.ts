import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { TestsModule } from '../tests/tests.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TestsModule, NotificationsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
