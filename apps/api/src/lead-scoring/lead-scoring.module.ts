import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeadScoringController } from './lead-scoring.controller';
import { LeadScoringService } from './lead-scoring.service';

@Module({
  imports: [AuthModule],
  controllers: [LeadScoringController],
  providers: [LeadScoringService],
  exports: [LeadScoringService],
})
export class LeadScoringModule {}
