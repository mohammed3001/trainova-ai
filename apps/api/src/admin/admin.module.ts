import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VerificationModule } from '../verification/verification.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminReportsService } from './admin-reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [AuthModule, VerificationModule],
  controllers: [AdminController, ReportsController],
  providers: [AdminService, AdminOpsService, AdminReportsService],
})
export class AdminModule {}
