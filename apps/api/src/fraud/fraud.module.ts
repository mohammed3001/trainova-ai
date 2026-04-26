import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminFraudController } from './admin-fraud.controller';
import { FraudService } from './fraud.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminFraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
