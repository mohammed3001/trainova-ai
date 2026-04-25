-- T7.I: Email Marketing — Campaigns + Drip sequences

-- CreateEnum
CREATE TYPE "EmailCampaignKind" AS ENUM ('BROADCAST');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailCampaignSendStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EmailDripTrigger" AS ENUM ('USER_REGISTERED', 'TRAINER_PROFILE_INCOMPLETE', 'COMPANY_FIRST_REQUEST_PENDING', 'MANUAL');

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EmailCampaignKind" NOT NULL DEFAULT 'BROADCAST',
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "segmentJson" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailCampaign_status_scheduledFor_idx" ON "EmailCampaign"("status", "scheduledFor");

-- CreateTable
CREATE TABLE "EmailCampaignSend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "EmailCampaignSendStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "EmailCampaignSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaignSend_campaignId_userId_key" ON "EmailCampaignSend"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "EmailCampaignSend_status_campaignId_idx" ON "EmailCampaignSend"("status", "campaignId");

-- CreateTable
CREATE TABLE "EmailDripSequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "trigger" "EmailDripTrigger" NOT NULL DEFAULT 'MANUAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDripSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDripSequence_slug_key" ON "EmailDripSequence"("slug");

-- CreateIndex
CREATE INDEX "EmailDripSequence_trigger_enabled_idx" ON "EmailDripSequence"("trigger", "enabled");

-- CreateTable
CREATE TABLE "EmailDripStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,

    CONSTRAINT "EmailDripStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDripStep_sequenceId_order_key" ON "EmailDripStep"("sequenceId", "order");

-- CreateTable
CREATE TABLE "EmailDripEnrollment" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStepIdx" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDripEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDripEnrollment_sequenceId_userId_key" ON "EmailDripEnrollment"("sequenceId", "userId");

-- CreateIndex
CREATE INDEX "EmailDripEnrollment_nextRunAt_completedAt_cancelledAt_idx" ON "EmailDripEnrollment"("nextRunAt", "completedAt", "cancelledAt");

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignSend" ADD CONSTRAINT "EmailCampaignSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignSend" ADD CONSTRAINT "EmailCampaignSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDripSequence" ADD CONSTRAINT "EmailDripSequence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDripStep" ADD CONSTRAINT "EmailDripStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailDripSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDripEnrollment" ADD CONSTRAINT "EmailDripEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailDripSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDripEnrollment" ADD CONSTRAINT "EmailDripEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
