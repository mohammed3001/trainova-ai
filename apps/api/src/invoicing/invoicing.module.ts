import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoiceService } from './invoice.service';
import {
  AdminTaxRulesController,
  CompanyInvoicesController,
  MeTaxProfileController,
  TrainerStatementsController,
} from './invoicing.controller';
import { TaxProfileService } from './tax-profile.service';
import { TaxService } from './tax.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    CompanyInvoicesController,
    TrainerStatementsController,
    MeTaxProfileController,
    AdminTaxRulesController,
  ],
  providers: [TaxService, TaxProfileService, InvoiceService],
  exports: [TaxService, TaxProfileService, InvoiceService],
})
export class InvoicingModule {}
