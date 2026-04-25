-- T7.C — E-Signature: ContractTemplate, ContractDocument, ContractSignature
-- Adds template authoring (Admin), per-Contract document instances frozen
-- at generation time (`bodyHash` is sha-256 over the Markdown body), and
-- per-signer signature rows. ContractSignature is unique on (documentId,
-- role) so each document has at most one COMPANY + one TRAINER row.

-- CreateEnum
CREATE TYPE "ContractDocumentKind" AS ENUM ('NDA', 'MSA', 'SOW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ContractTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContractDocumentStatus" AS ENUM ('DRAFT', 'AWAITING_SIGNATURES', 'PARTIALLY_SIGNED', 'FULLY_SIGNED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignatureRole" AS ENUM ('COMPANY', 'TRAINER');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'SIGNED', 'DECLINED');

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "kind" "ContractDocumentKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bodyMarkdown" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'EN',
    "variables" JSONB NOT NULL,
    "status" "ContractTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "templateId" TEXT,
    "kind" "ContractDocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "status" "ContractDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "role" "SignatureRole" NOT NULL,
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "signedName" TEXT,
    "intent" TEXT,
    "signatureHash" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_slug_key" ON "ContractTemplate"("slug");

-- CreateIndex
CREATE INDEX "ContractTemplate_kind_status_idx" ON "ContractTemplate"("kind", "status");

-- CreateIndex
CREATE INDEX "ContractTemplate_locale_idx" ON "ContractTemplate"("locale");

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_idx" ON "ContractDocument"("contractId");

-- CreateIndex
CREATE INDEX "ContractDocument_status_idx" ON "ContractDocument"("status");

-- CreateIndex
CREATE INDEX "ContractDocument_templateId_idx" ON "ContractDocument"("templateId");

-- CreateIndex
CREATE INDEX "ContractSignature_signerId_idx" ON "ContractSignature"("signerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSignature_documentId_role_key" ON "ContractSignature"("documentId", "role");

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ContractDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
