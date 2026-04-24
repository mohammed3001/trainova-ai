-- T5.C.3 — extend Setting with isPublic + description + updatedBy + indexes

ALTER TABLE "Setting"
  ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedBy" TEXT;

CREATE INDEX IF NOT EXISTS "Setting_group_idx" ON "Setting"("group");
CREATE INDEX IF NOT EXISTS "Setting_isPublic_idx" ON "Setting"("isPublic");
