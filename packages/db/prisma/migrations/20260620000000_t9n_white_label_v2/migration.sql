-- T9.N White-label v2: branding tokens + agency hierarchy.

CREATE TYPE "BrandingPresetKey" AS ENUM (
  'CORPORATE_BLUE',
  'MINIMAL_GREEN',
  'BOLD_PURPLE',
  'NEUTRAL_GRAY'
);

ALTER TABLE "Company"
  ADD COLUMN "brandPrimaryColor"   TEXT,
  ADD COLUMN "brandSecondaryColor" TEXT,
  ADD COLUMN "brandPresetKey"      "BrandingPresetKey",
  ADD COLUMN "parentAgencyId"      TEXT;

ALTER TABLE "Company"
  ADD CONSTRAINT "Company_parentAgencyId_fkey"
  FOREIGN KEY ("parentAgencyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Company_parentAgencyId_idx" ON "Company"("parentAgencyId");
