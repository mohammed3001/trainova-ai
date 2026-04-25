import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SponsoredModule } from '../sponsored/sponsored.module';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [AuthModule, SponsoredModule],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
