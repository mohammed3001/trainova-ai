-- T7.H — Per-user saved chat message templates.
--
-- Templates are private to the owning user (FK ON DELETE CASCADE) and never
-- referenced server-side when sending; they are expanded client-side and
-- posted as ordinary `Message` rows. The unique constraint keeps the picker
-- deterministic ("you can't have two templates named 'Schedule call'") and
-- the (userId, updatedAt) index supports the recent-first listing in the
-- composer dropdown without a sort.

CREATE TABLE "MessageTemplate" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "body"      TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageTemplate_userId_name_key"
    ON "MessageTemplate"("userId", "name");

CREATE INDEX "MessageTemplate_userId_updatedAt_idx"
    ON "MessageTemplate"("userId", "updatedAt");

ALTER TABLE "MessageTemplate"
    ADD CONSTRAINT "MessageTemplate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
