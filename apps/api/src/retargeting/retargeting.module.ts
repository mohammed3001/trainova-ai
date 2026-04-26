import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminRetargetingController } from './admin-retargeting.controller';
import { RetargetingPixelController } from './pixel.controller';
import { RetargetingService } from './retargeting.service';

/**
 * T9.G — Retargeting + audience segments.
 *
 * Public pixel/event ingestion + admin segment CRUD. The recompute
 * cron lives inside `RetargetingService` and reuses the same
 * `ScheduleModule.forRoot()` registration that other modules already
 * establish; importing it here is harmless because Nest dedupes
 * `forRoot()` registrations across the app.
 */
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [RetargetingPixelController, AdminRetargetingController],
  providers: [RetargetingService],
  exports: [RetargetingService],
})
export class RetargetingModule {}
