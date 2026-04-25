-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "InterviewMeeting" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "applicationId" TEXT,
    "scheduledById" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL,
    "meetingUrl" TEXT,
    "agenda" TEXT,
    "notes" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "rescheduledFromId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewMeeting_rescheduledFromId_key" ON "InterviewMeeting"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "InterviewMeeting_conversationId_scheduledAt_idx" ON "InterviewMeeting"("conversationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "InterviewMeeting_trainerId_status_scheduledAt_idx" ON "InterviewMeeting"("trainerId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "InterviewMeeting_scheduledById_status_scheduledAt_idx" ON "InterviewMeeting"("scheduledById", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "InterviewMeeting_status_scheduledAt_idx" ON "InterviewMeeting"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "InterviewMeeting" ADD CONSTRAINT "InterviewMeeting_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewMeeting" ADD CONSTRAINT "InterviewMeeting_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewMeeting" ADD CONSTRAINT "InterviewMeeting_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewMeeting" ADD CONSTRAINT "InterviewMeeting_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewMeeting" ADD CONSTRAINT "InterviewMeeting_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewMeeting" ADD CONSTRAINT "InterviewMeeting_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "InterviewMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
