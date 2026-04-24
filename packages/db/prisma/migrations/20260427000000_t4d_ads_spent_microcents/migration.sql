-- Sub-cent accumulator for CPM charges. cpmCents is cost per 1000 impressions,
-- so per-impression cost in microcents equals cpmCents numerically (1 cent =
-- 1000 microcents). Flooring cpmCents/1000 to integer cents caused any CPM
-- below $10/1000 to charge 0. Backfill existing rows from the whole-cent total.
ALTER TABLE "AdCampaign" ADD COLUMN "spentMicroCents" BIGINT NOT NULL DEFAULT 0;
UPDATE "AdCampaign" SET "spentMicroCents" = "spentCents"::BIGINT * 1000;
