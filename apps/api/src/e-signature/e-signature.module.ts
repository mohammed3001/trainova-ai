import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContractDocumentsController } from './contract-documents.controller';
import { ContractDocumentsService } from './contract-documents.service';
import { ContractTemplatesAdminController } from './contract-templates.controller';
import { ContractTemplatesPublicController } from './contract-templates-public.controller';
import { ContractTemplatesService } from './contract-templates.service';

/**
 * T7.C — E-Signature.
 *
 * - `ContractTemplate` is admin-curated reusable Markdown body (NDA / MSA /
 *   SOW / CUSTOM) with declared variables. Slug is unique per kind+locale.
 * - `ContractDocument` is a frozen instance bound to a Contract. The
 *   bodyHash captured at generation time is the source of truth; any
 *   later mutation of bodyMarkdown is detected on read and signing is
 *   refused.
 * - `ContractSignature` is one row per signer (COMPANY + TRAINER) created
 *   alongside the document. Both must sign before the document
 *   transitions to `FULLY_SIGNED`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    ContractTemplatesAdminController,
    ContractTemplatesPublicController,
    ContractDocumentsController,
  ],
  providers: [ContractTemplatesService, ContractDocumentsService],
  exports: [ContractTemplatesService, ContractDocumentsService],
})
export class ESignatureModule {}
