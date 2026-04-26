-- T9.K Webhooks v1: outbound webhook subscriptions + delivery log.

CREATE TYPE "WebhookEventType" AS ENUM (
  'APPLICATION_CREATED',
  'APPLICATION_STATUS_CHANGED',
  'APPLICATION_HIRED',
  'CONTRACT_CREATED',
  'CONTRACT_COMPLETED',
  'MILESTONE_RELEASED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_CANCELLED'
);

CREATE TYPE "WebhookDeliveryStatus" AS ENUM (
  'PENDING',
  'IN_FLIGHT',
  'SUCCEEDED',
  'FAILED',
  'ABANDONED'
);

CREATE TABLE "Webhook" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "secret"       TEXT NOT NULL,
  "events"       "WebhookEventType"[] DEFAULT ARRAY[]::"WebhookEventType"[],
  "description"  TEXT,
  "enabled"      BOOLEAN NOT NULL DEFAULT TRUE,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "disabledAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Webhook_companyId_idx" ON "Webhook"("companyId");
CREATE INDEX "Webhook_enabled_companyId_idx" ON "Webhook"("enabled", "companyId");

ALTER TABLE "Webhook"
  ADD CONSTRAINT "Webhook_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookDelivery" (
  "id"            TEXT NOT NULL,
  "webhookId"     TEXT NOT NULL,
  "eventType"     "WebhookEventType" NOT NULL,
  "payload"       JSONB NOT NULL,
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "status"        "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStatus"    INTEGER,
  "lastResponse"  TEXT,
  "deliveredAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx"
  ON "WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx"
  ON "WebhookDelivery"("webhookId", "createdAt" DESC);

ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_webhookId_fkey"
  FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
