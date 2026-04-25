-- T6.C — VAT/tax invoicing on contracts + payouts
--
-- Adds:
--   * TaxRule (admin catalog), TaxProfile (per-user registration)
--   * Invoice (immutable financial doc), InvoiceCounter (atomic seq)
--   * Tax breakdown columns on Contract / Milestone / Payout
--
-- All new columns on existing tables default to 0/false so legacy rows
-- remain valid (pre-T6.C contracts are treated as tax-inclusive with
-- subtotal=total/taxRate=0).

-- ---------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "TaxKind" AS ENUM ('VAT', 'GST', 'SALES_TAX', 'ZAKAT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TaxEntityKind" AS ENUM ('INDIVIDUAL', 'BUSINESS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceKind" AS ENUM ('PURCHASE', 'PAYOUT_STATEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------
-- Contract — tax breakdown columns
-- ---------------------------------------------------------------
ALTER TABLE "Contract"
  ADD COLUMN IF NOT EXISTS "subtotalAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "taxNote" TEXT,
  ADD COLUMN IF NOT EXISTS "reverseCharge" BOOLEAN NOT NULL DEFAULT false;

-- Backfill subtotalAmountCents = totalAmountCents for existing rows so
-- old contracts render coherent invoice subtotals (tax = 0 for those).
UPDATE "Contract" SET "subtotalAmountCents" = "totalAmountCents"
  WHERE "subtotalAmountCents" = 0 AND "totalAmountCents" > 0;

-- ---------------------------------------------------------------
-- Milestone — tax breakdown columns
-- ---------------------------------------------------------------
ALTER TABLE "Milestone"
  ADD COLUMN IF NOT EXISTS "subtotalCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxAmountCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "Milestone" SET "subtotalCents" = "amountCents"
  WHERE "subtotalCents" = 0 AND "amountCents" > 0;

-- ---------------------------------------------------------------
-- Payout — gross/fee/tax breakdown for self-billing statements
-- ---------------------------------------------------------------
ALTER TABLE "Payout"
  ADD COLUMN IF NOT EXISTS "grossAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "feeAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxAmountCents" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------
-- TaxRule — admin catalog of country tax rules
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TaxRule" (
  "id"               TEXT NOT NULL,
  "countryCode"      TEXT NOT NULL,
  "label"            TEXT NOT NULL,
  "kind"             "TaxKind" NOT NULL DEFAULT 'VAT',
  "rateBps"          INTEGER NOT NULL,
  "b2bReverseCharge" BOOLEAN NOT NULL DEFAULT false,
  "exportZeroRated"  BOOLEAN NOT NULL DEFAULT true,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaxRule_countryCode_key" ON "TaxRule"("countryCode");
CREATE INDEX IF NOT EXISTS "TaxRule_active_idx" ON "TaxRule"("active");

-- Seed common jurisdictions. Admins can edit/disable from the Tax
-- Rules page; rates here reflect 2025 statutory rates.
INSERT INTO "TaxRule" ("id", "countryCode", "label", "kind", "rateBps", "b2bReverseCharge", "exportZeroRated", "active", "createdAt", "updatedAt") VALUES
  ('seed_taxrule_sa', 'SA', 'VAT',         'VAT',       1500, false, true,  true, NOW(), NOW()),
  ('seed_taxrule_ae', 'AE', 'VAT',         'VAT',        500, false, true,  true, NOW(), NOW()),
  ('seed_taxrule_eg', 'EG', 'VAT',         'VAT',       1400, false, true,  true, NOW(), NOW()),
  ('seed_taxrule_de', 'DE', 'VAT',         'VAT',       1900, true,  true,  true, NOW(), NOW()),
  ('seed_taxrule_fr', 'FR', 'TVA',         'VAT',       2000, true,  true,  true, NOW(), NOW()),
  ('seed_taxrule_es', 'ES', 'IVA',         'VAT',       2100, true,  true,  true, NOW(), NOW()),
  ('seed_taxrule_gb', 'GB', 'VAT',         'VAT',       2000, true,  true,  true, NOW(), NOW()),
  ('seed_taxrule_us', 'US', 'Sales Tax',   'SALES_TAX',    0, false, true,  true, NOW(), NOW()),
  ('seed_taxrule_ca', 'CA', 'GST',         'GST',        500, false, true,  true, NOW(), NOW()),
  ('seed_taxrule_au', 'AU', 'GST',         'GST',       1000, false, true,  true, NOW(), NOW()),
  ('seed_taxrule_in', 'IN', 'GST',         'GST',       1800, true,  true,  true, NOW(), NOW())
ON CONFLICT ("countryCode") DO NOTHING;

-- ---------------------------------------------------------------
-- TaxProfile — per-user tax registration
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TaxProfile" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "countryCode"   TEXT NOT NULL,
  "kind"          "TaxEntityKind" NOT NULL DEFAULT 'INDIVIDUAL',
  "legalName"     TEXT,
  "taxId"         TEXT,
  "taxIdVerified" BOOLEAN NOT NULL DEFAULT false,
  "addressLine1"  TEXT,
  "addressLine2"  TEXT,
  "city"          TEXT,
  "region"        TEXT,
  "postalCode"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaxProfile_userId_key" ON "TaxProfile"("userId");
CREATE INDEX IF NOT EXISTS "TaxProfile_countryCode_idx" ON "TaxProfile"("countryCode");

ALTER TABLE "TaxProfile"
  ADD CONSTRAINT "TaxProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------
-- Invoice + InvoiceCounter
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"                TEXT NOT NULL,
  "number"            TEXT NOT NULL,
  "kind"              "InvoiceKind" NOT NULL,
  "status"            "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "contractId"        TEXT,
  "milestoneId"       TEXT,
  "payoutId"          TEXT,
  "issuerName"        TEXT NOT NULL,
  "issuerCountry"     TEXT,
  "issuerTaxId"       TEXT,
  "issuerAddress"     TEXT,
  "recipientName"     TEXT NOT NULL,
  "recipientCountry"  TEXT,
  "recipientTaxId"    TEXT,
  "recipientAddress"  TEXT,
  "currency"          TEXT NOT NULL DEFAULT 'USD',
  "subtotalCents"     INTEGER NOT NULL,
  "taxRateBps"        INTEGER NOT NULL DEFAULT 0,
  "taxAmountCents"    INTEGER NOT NULL DEFAULT 0,
  "totalCents"        INTEGER NOT NULL,
  "taxLabel"          TEXT,
  "taxNote"           TEXT,
  "reverseCharge"     BOOLEAN NOT NULL DEFAULT false,
  "lineItemsJson"     JSONB NOT NULL,
  "issuedById"        TEXT,
  "issuedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"            TIMESTAMP(3),
  "voidedAt"          TIMESTAMP(3),
  "replacesInvoiceId" TEXT,
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_replacesInvoiceId_key" ON "Invoice"("replacesInvoiceId");
CREATE INDEX IF NOT EXISTS "Invoice_kind_issuedAt_idx" ON "Invoice"("kind", "issuedAt");
CREATE INDEX IF NOT EXISTS "Invoice_contractId_idx" ON "Invoice"("contractId");
CREATE INDEX IF NOT EXISTS "Invoice_milestoneId_idx" ON "Invoice"("milestoneId");
CREATE INDEX IF NOT EXISTS "Invoice_payoutId_idx" ON "Invoice"("payoutId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_milestoneId_fkey"
    FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_issuedById_fkey"
    FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_replacesInvoiceId_fkey"
    FOREIGN KEY ("replacesInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "InvoiceCounter" (
  "year"      INTEGER NOT NULL,
  "lastSeq"   INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);
