-- CreateEnum
CREATE TYPE "KycSessionStatus" AS ENUM ('PENDING', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "KycProviderName" AS ENUM ('STUB', 'ONFIDO', 'PERSONA', 'STRIPE_IDENTITY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "kycVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KycSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "KycProviderName" NOT NULL,
    "providerSessionId" TEXT,
    "status" "KycSessionStatus" NOT NULL DEFAULT 'PENDING',
    "documentType" TEXT,
    "documentCountry" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "decisionReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KycSession_userId_status_idx" ON "KycSession"("userId", "status");

-- CreateIndex
CREATE INDEX "KycSession_status_createdAt_idx" ON "KycSession"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "KycSession" ADD CONSTRAINT "KycSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycSession" ADD CONSTRAINT "KycSession_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
