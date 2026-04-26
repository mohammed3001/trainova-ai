-- T9.D — Lead scoring + fraud signals on Application
-- Persists a heuristic risk score + flag list + admin review trail directly on
-- the Application row. Score is a 0–100 integer (higher = riskier). Level is
-- derived from score thresholds at write time so dashboards can index/filter
-- without re-bucketing. All columns are nullable to preserve backfill safety;
-- a separate scoring run will populate existing rows lazily.

CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

ALTER TABLE "Application"
  ADD COLUMN "riskScore"       INTEGER,
  ADD COLUMN "riskLevel"       "RiskLevel",
  ADD COLUMN "riskFlags"       TEXT[]   NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "riskComputedAt"  TIMESTAMP(3),
  ADD COLUMN "riskReviewedAt"  TIMESTAMP(3),
  ADD COLUMN "riskReviewedBy"  TEXT,
  ADD COLUMN "riskReviewNote"  TEXT;

-- Admin review pages filter by level (HIGH/CRITICAL inbox) and skip rows
-- that have already been reviewed. The composite index covers both filters.
CREATE INDEX "Application_riskLevel_riskReviewedAt_idx"
  ON "Application" ("riskLevel", "riskReviewedAt");
