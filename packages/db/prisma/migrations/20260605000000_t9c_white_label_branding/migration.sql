-- T9.C — White-label enterprise portal: per-company branding + custom domain.
-- All columns are nullable so existing companies stay on the platform-default
-- look-and-feel until an OWNER explicitly opts in.

ALTER TABLE "Company" ADD COLUMN "brandingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "brandColorHex" TEXT;
ALTER TABLE "Company" ADD COLUMN "accentColorHex" TEXT;
ALTER TABLE "Company" ADD COLUMN "faviconUrl" TEXT;
ALTER TABLE "Company" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "Company" ADD COLUMN "footerNote" TEXT;
ALTER TABLE "Company" ADD COLUMN "customDomain" TEXT;
ALTER TABLE "Company" ADD COLUMN "customDomainVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Company_customDomain_key" ON "Company"("customDomain");
