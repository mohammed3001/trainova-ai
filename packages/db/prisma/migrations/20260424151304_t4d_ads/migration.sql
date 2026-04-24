/*
  Warnings:

  - You are about to drop the column `budget` on the `AdCampaign` table. All the data in the column will be lost.
  - You are about to drop the column `targeting` on the `AdCampaign` table. All the data in the column will be lost.
  - The `status` column on the `AdCampaign` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `meta` on the `AdClick` table. All the data in the column will be lost.
  - The `type` column on the `AdCreative` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `placements` column on the `AdCreative` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `meta` on the `AdImpression` table. All the data in the column will be lost.
  - Added the required column `ownerId` to the `AdCampaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AdCampaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaignId` to the `AdClick` table without a default value. This is not possible if the table is not empty.
  - Added the required column `placement` to the `AdClick` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AdCreative` table without a default value. This is not possible if the table is not empty.
  - Made the column `ctaUrl` on table `AdCreative` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `campaignId` to the `AdImpression` table without a default value. This is not possible if the table is not empty.
  - Added the required column `placement` to the `AdImpression` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'REJECTED', 'ENDED');

-- CreateEnum
CREATE TYPE "AdPricingModel" AS ENUM ('CPM', 'CPC', 'FLAT');

-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('HOMEPAGE_HERO', 'SIDEBAR_SEARCH', 'FEATURED_TRAINER', 'FEATURED_COMPANY', 'SEARCH_RESULT', 'CATEGORY_SPONSOR', 'NEWSLETTER', 'NATIVE_LISTING');

-- CreateEnum
CREATE TYPE "AdCreativeType" AS ENUM ('BANNER', 'SPONSORED_LISTING', 'FEATURED_TRAINER', 'CATEGORY_SPONSOR', 'NATIVE');

-- CreateEnum
CREATE TYPE "AdTopupStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- DropIndex
DROP INDEX "AdClick_creativeId_idx";

-- DropIndex
DROP INDEX "AdImpression_creativeId_idx";

-- AlterTable
ALTER TABLE "AdCampaign" DROP COLUMN "budget",
DROP COLUMN "targeting",
ADD COLUMN     "budgetCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cpcCents" INTEGER,
ADD COLUMN     "cpmCents" INTEGER,
ADD COLUMN     "flatFeeCents" INTEGER,
ADD COLUMN     "frequencyCapPerDay" INTEGER,
ADD COLUMN     "ownerId" TEXT NOT NULL,
ADD COLUMN     "pricingModel" "AdPricingModel" NOT NULL DEFAULT 'CPM',
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "spentCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "targetingCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetingLocales" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetingSkillIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "AdClick" DROP COLUMN "meta",
ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "chargedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "sessionHash" TEXT,
ADD COLUMN     "userId" TEXT,
DROP COLUMN "placement",
ADD COLUMN     "placement" "AdPlacement" NOT NULL;

-- AlterTable
ALTER TABLE "AdCreative" ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ctaLabel" TEXT,
ADD COLUMN     "impressionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 1,
DROP COLUMN "type",
ADD COLUMN     "type" "AdCreativeType" NOT NULL DEFAULT 'NATIVE',
ALTER COLUMN "ctaUrl" SET NOT NULL,
DROP COLUMN "placements",
ADD COLUMN     "placements" "AdPlacement"[] DEFAULT ARRAY[]::"AdPlacement"[];

-- AlterTable
ALTER TABLE "AdImpression" DROP COLUMN "meta",
ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "chargedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "sessionHash" TEXT,
ADD COLUMN     "userId" TEXT,
DROP COLUMN "placement",
ADD COLUMN     "placement" "AdPlacement" NOT NULL;

-- CreateTable
CREATE TABLE "AdTopup" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripePaymentIntentId" TEXT,
    "status" "AdTopupStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdTopup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdTopup_stripePaymentIntentId_key" ON "AdTopup"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "AdTopup_campaignId_idx" ON "AdTopup"("campaignId");

-- CreateIndex
CREATE INDEX "AdCampaign_ownerId_idx" ON "AdCampaign"("ownerId");

-- CreateIndex
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");

-- CreateIndex
CREATE INDEX "AdCampaign_companyId_idx" ON "AdCampaign"("companyId");

-- CreateIndex
CREATE INDEX "AdClick_creativeId_createdAt_idx" ON "AdClick"("creativeId", "createdAt");

-- CreateIndex
CREATE INDEX "AdClick_campaignId_createdAt_idx" ON "AdClick"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCreative_campaignId_idx" ON "AdCreative"("campaignId");

-- CreateIndex
CREATE INDEX "AdImpression_creativeId_createdAt_idx" ON "AdImpression"("creativeId", "createdAt");

-- CreateIndex
CREATE INDEX "AdImpression_campaignId_createdAt_idx" ON "AdImpression"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AdImpression_sessionHash_createdAt_idx" ON "AdImpression"("sessionHash", "createdAt");

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdImpression" ADD CONSTRAINT "AdImpression_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdClick" ADD CONSTRAINT "AdClick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdTopup" ADD CONSTRAINT "AdTopup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
