-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'COMPANY', 'TRAINER', 'REQUEST', 'APPLICATION', 'MESSAGE', 'CONVERSATION', 'REVIEW', 'TEST', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'FRAUD', 'IMPERSONATION', 'COPYRIGHT', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportResolution" AS ENUM ('NO_ACTION', 'WARNING_ISSUED', 'CONTENT_REMOVED', 'USER_SUSPENDED', 'USER_BANNED', 'ESCALATED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lockReason" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "redactReason" TEXT,
ADD COLUMN     "redactedAt" TIMESTAMP(3),
ADD COLUMN     "redactedById" TEXT;

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "ReportResolution",
    "resolverId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolverNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- CreateIndex
CREATE INDEX "Conversation_lockedAt_idx" ON "Conversation"("lockedAt");

-- CreateIndex
CREATE INDEX "Message_redactedAt_idx" ON "Message"("redactedAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolverId_fkey" FOREIGN KEY ("resolverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
