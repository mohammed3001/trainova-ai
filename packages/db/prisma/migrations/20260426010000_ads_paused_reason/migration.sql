-- T4.D hardening — distinguish auto-pause (budget exhausted) from admin / owner
-- manual pause. creditBudget() may only auto-reactivate BUDGET_EXHAUSTED pauses;
-- admin/owner pauses must survive a top-up so policy-violating ads can't be
-- silently re-enabled by paying more money.
CREATE TYPE "AdPauseReason" AS ENUM ('BUDGET_EXHAUSTED', 'ADMIN', 'OWNER');

ALTER TABLE "AdCampaign"
  ADD COLUMN "pausedReason" "AdPauseReason";

-- Any pre-existing PAUSED campaign in production was produced by the previous
-- logic in recordImpression, which only ever paused for budget exhaustion.
-- Backfill matches that semantics.
UPDATE "AdCampaign"
  SET "pausedReason" = 'BUDGET_EXHAUSTED'
  WHERE "status" = 'PAUSED'
    AND "pausedReason" IS NULL;
