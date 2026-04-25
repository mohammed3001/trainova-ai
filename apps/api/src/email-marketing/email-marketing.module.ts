import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingService } from './email-marketing.service';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule],
  controllers: [EmailMarketingController],
  providers: [EmailMarketingService],
  exports: [EmailMarketingService],
})
export class EmailMarketingModule {}
