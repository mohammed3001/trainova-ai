-- CreateEnum
CREATE TYPE "RetargetingEventType" AS ENUM ('PAGE_VIEW', 'TRAINER_VIEW', 'REQUEST_VIEW', 'COMPANY_VIEW', 'APPLICATION_START', 'CHECKOUT_START', 'CHECKOUT_ABANDON', 'CHECKOUT_COMPLETE', 'SEARCH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RetargetingEntityKind" AS ENUM ('TRAINER', 'REQUEST', 'COMPANY', 'CONTRACT', 'TEST', 'OTHER');

-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN     "targetingAudienceSegmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "RetargetingEvent" (
    "id" TEXT NOT NULL,
    "cookieId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" "RetargetingEventType" NOT NULL,
    "path" TEXT,
    "entityKind" "RetargetingEntityKind",
    "entityId" TEXT,
    "locale" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetargetingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceSegment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "lookbackDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recomputedAt" TIMESTAMP(3),
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceMembership" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "cookieId" TEXT,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudienceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetargetingEvent_cookieId_createdAt_idx" ON "RetargetingEvent"("cookieId", "createdAt");

-- CreateIndex
CREATE INDEX "RetargetingEvent_userId_createdAt_idx" ON "RetargetingEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RetargetingEvent_eventType_createdAt_idx" ON "RetargetingEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "RetargetingEvent_entityKind_entityId_createdAt_idx" ON "RetargetingEvent"("entityKind", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceSegment_slug_key" ON "AudienceSegment"("slug");

-- CreateIndex
CREATE INDEX "AudienceSegment_isActive_recomputedAt_idx" ON "AudienceSegment"("isActive", "recomputedAt");

-- CreateIndex
CREATE INDEX "AudienceMembership_cookieId_expiresAt_idx" ON "AudienceMembership"("cookieId", "expiresAt");

-- CreateIndex
CREATE INDEX "AudienceMembership_userId_expiresAt_idx" ON "AudienceMembership"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AudienceMembership_segmentId_expiresAt_idx" ON "AudienceMembership"("segmentId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceMembership_segmentId_cookieId_key" ON "AudienceMembership"("segmentId", "cookieId");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceMembership_segmentId_userId_key" ON "AudienceMembership"("segmentId", "userId");

-- AddForeignKey
ALTER TABLE "RetargetingEvent" ADD CONSTRAINT "RetargetingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSegment" ADD CONSTRAINT "AudienceSegment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceMembership" ADD CONSTRAINT "AudienceMembership_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "AudienceSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceMembership" ADD CONSTRAINT "AudienceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
