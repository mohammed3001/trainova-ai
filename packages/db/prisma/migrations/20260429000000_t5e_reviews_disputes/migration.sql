-- T5.E — Reviews provenance + Disputes lifecycle

-- 1) Review: add contractId + author/contract uniqueness so each side can leave
--    one review per contract. Old free-form reviews keep their NULL contractId.
ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "contractId" TEXT;

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Unique on (authorId, contractId): when contractId is non-null, blocks
-- duplicates; when both rows have NULL contractId, Postgres treats NULL as
-- distinct so legacy free-form reviews are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "Review_authorId_contractId_key"
  ON "Review"("authorId", "contractId");

CREATE INDEX IF NOT EXISTS "Review_contractId_idx" ON "Review"("contractId");

-- 2) Dispute lifecycle types
DO $$ BEGIN
  CREATE TYPE "DisputeStatus" AS ENUM (
    'OPEN',
    'UNDER_REVIEW',
    'RESOLVED_FOR_TRAINER',
    'RESOLVED_FOR_COMPANY',
    'REJECTED',
    'WITHDRAWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DisputePartyRole" AS ENUM ('COMPANY', 'TRAINER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Dispute table
CREATE TABLE IF NOT EXISTS "Dispute" (
  "id"           TEXT PRIMARY KEY,
  "contractId"   TEXT NOT NULL,
  "raisedById"   TEXT NOT NULL,
  "raisedByRole" "DisputePartyRole" NOT NULL,
  "reason"       TEXT NOT NULL,
  "description"  TEXT,
  "evidence"     JSONB,
  "status"       "DisputeStatus" NOT NULL DEFAULT 'OPEN',
  "resolverId"   TEXT,
  "resolution"   TEXT,
  "resolvedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Dispute_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Dispute_raisedById_fkey"
    FOREIGN KEY ("raisedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Dispute_resolverId_fkey"
    FOREIGN KEY ("resolverId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Dispute_contractId_status_idx"
  ON "Dispute"("contractId", "status");
CREATE INDEX IF NOT EXISTS "Dispute_status_createdAt_idx"
  ON "Dispute"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Dispute_raisedById_idx"
  ON "Dispute"("raisedById");

-- Service layer enforces "one active dispute per contract" by checking
-- for OPEN/UNDER_REVIEW rows on raise. We also add a partial unique index
-- as a defence-in-depth backstop so concurrent raises cannot both succeed.
CREATE UNIQUE INDEX IF NOT EXISTS "Dispute_contract_active_unique"
  ON "Dispute"("contractId")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');
