-- T9.L Marketplace Search v2 — saved searches + full-text ranking on JobRequest

-- 1) SavedSearch table
CREATE TABLE "SavedSearch" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "queryJson"      JSONB NOT NULL,
  "notifyDaily"    BOOLEAN NOT NULL DEFAULT false,
  "lastNotifiedAt" TIMESTAMP(3),
  "nextNotifyAt"   TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedSearch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "SavedSearch_userId_createdAt_idx"
  ON "SavedSearch"("userId", "createdAt");
CREATE INDEX "SavedSearch_notifyDaily_nextNotifyAt_idx"
  ON "SavedSearch"("notifyDaily", "nextNotifyAt");

-- 2) tsvector column on JobRequest, computed from title+description+industry+modelFamily.
--    Generated column keeps it in sync without an explicit trigger; the
--    'simple' configuration is locale-agnostic so AR/EN/FR/ES rows index
--    consistently. The service still applies an `ILIKE` pre-filter for
--    short queries (where to_tsquery would over-truncate) and uses the
--    GIN index for ts_rank ordering on longer queries.
ALTER TABLE "JobRequest"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("objective", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'C') ||
    setweight(to_tsvector('simple', coalesce("industry", '')), 'D') ||
    setweight(to_tsvector('simple', coalesce("modelFamily", '')), 'D')
  ) STORED;

CREATE INDEX "JobRequest_searchVector_idx"
  ON "JobRequest" USING GIN ("searchVector");
