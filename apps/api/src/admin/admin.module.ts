import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VerificationModule } from '../verification/verification.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminReportsService } from './admin-reports.service';
import { ReportsController } from './reports.controller';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';

@Module({
  imports: [AuthModule, VerificationModule],
  controllers: [AdminController, ReportsController, EmailTemplatesController],
  providers: [AdminService, AdminOpsService, AdminReportsService, EmailTemplatesService],
  exports: [EmailTemplatesService],
})
export class AdminModule {}
