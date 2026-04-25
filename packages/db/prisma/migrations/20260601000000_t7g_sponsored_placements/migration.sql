-- CreateEnum
CREATE TYPE "SponsoredPlacementKind" AS ENUM ('TRAINER', 'JOB_REQUEST');

-- CreateEnum
CREATE TYPE "SponsoredPlacementStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SponsoredPlacementSource" AS ENUM ('ADMIN', 'SELF_PAID');

-- AlterTable
ALTER TABLE "TrainerProfile" ADD COLUMN "sponsoredUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JobRequest" ADD COLUMN "sponsoredUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SponsoredPlacement" (
    "id" TEXT NOT NULL,
    "kind" "SponsoredPlacementKind" NOT NULL,
    "trainerProfileId" TEXT,
    "jobRequestId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "source" "SponsoredPlacementSource" NOT NULL DEFAULT 'SELF_PAID',
    "status" "SponsoredPlacementStatus" NOT NULL DEFAULT 'DRAFT',
    "weight" INTEGER NOT NULL DEFAULT 20,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "pricedCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stripePaymentIntentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsoredPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerProfile_sponsoredUntil_idx" ON "TrainerProfile"("sponsoredUntil");

-- CreateIndex
CREATE INDEX "JobRequest_sponsoredUntil_idx" ON "JobRequest"("sponsoredUntil");

-- CreateIndex
CREATE UNIQUE INDEX "SponsoredPlacement_stripePaymentIntentId_key" ON "SponsoredPlacement"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "SponsoredPlacement_kind_status_endsAt_idx" ON "SponsoredPlacement"("kind", "status", "endsAt");

-- CreateIndex
CREATE INDEX "SponsoredPlacement_ownerId_idx" ON "SponsoredPlacement"("ownerId");

-- CreateIndex
CREATE INDEX "SponsoredPlacement_trainerProfileId_status_idx" ON "SponsoredPlacement"("trainerProfileId", "status");

-- CreateIndex
CREATE INDEX "SponsoredPlacement_jobRequestId_status_idx" ON "SponsoredPlacement"("jobRequestId", "status");

-- AddForeignKey
ALTER TABLE "SponsoredPlacement" ADD CONSTRAINT "SponsoredPlacement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredPlacement" ADD CONSTRAINT "SponsoredPlacement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredPlacement" ADD CONSTRAINT "SponsoredPlacement_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredPlacement" ADD CONSTRAINT "SponsoredPlacement_jobRequestId_fkey" FOREIGN KEY ("jobRequestId") REFERENCES "JobRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
