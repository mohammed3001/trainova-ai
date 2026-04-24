import { Module } from '@nestjs/common';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TestsController],
  providers: [TestsService],
  exports: [TestsService],
})
export class TestsModule {}
