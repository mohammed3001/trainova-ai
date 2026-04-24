import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { VerificationModule } from '../verification/verification.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminReportsService } from './admin-reports.service';
import { ReportsController } from './reports.controller';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';

@Module({
  imports: [AuthModule, VerificationModule, PaymentsModule],
  controllers: [
    AdminController,
    ReportsController,
    EmailTemplatesController,
    AdminFinanceController,
  ],
  providers: [
    AdminService,
    AdminOpsService,
    AdminReportsService,
    EmailTemplatesService,
    AdminFinanceService,
  ],
  exports: [EmailTemplatesService],
})
export class AdminModule {}
