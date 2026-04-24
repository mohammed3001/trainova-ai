import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VerificationModule } from '../verification/verification.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, VerificationModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
