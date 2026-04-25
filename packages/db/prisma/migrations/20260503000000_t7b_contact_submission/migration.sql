-- CreateEnum
CREATE TYPE "ContactSubmissionStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM');

-- CreateEnum
CREATE TYPE "ContactSubmissionTopic" AS ENUM ('GENERAL', 'SALES', 'SUPPORT', 'PRESS', 'PARTNERSHIP', 'ADVERTISING');

-- CreateTable
CREATE TABLE "ContactSubmission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" "ContactSubmissionTopic" NOT NULL DEFAULT 'GENERAL',
    "company" TEXT,
    "message" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "locale" TEXT,
    "status" "ContactSubmissionStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactSubmission_status_createdAt_idx" ON "ContactSubmission"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ContactSubmission_email_idx" ON "ContactSubmission"("email");
