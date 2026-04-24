-- CreateEnum
CREATE TYPE "ModelCallOperation" AS ENUM ('CHAT', 'COMPLETE', 'EMBED', 'CUSTOM');

-- AlterTable
ALTER TABLE "JobRequest"
  ADD COLUMN "modelConnectionId" TEXT;

-- CreateIndex
CREATE INDEX "JobRequest_modelConnectionId_idx" ON "JobRequest"("modelConnectionId");

-- AddForeignKey
ALTER TABLE "JobRequest"
  ADD CONSTRAINT "JobRequest_modelConnectionId_fkey"
  FOREIGN KEY ("modelConnectionId") REFERENCES "ModelConnection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ModelCall" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "applicationId" TEXT,
    "jobRequestId" TEXT,
    "trainerId" TEXT NOT NULL,
    "operation" "ModelCallOperation" NOT NULL DEFAULT 'CHAT',
    "requestBody" JSONB NOT NULL,
    "responseBody" JSONB,
    "responseStatus" INTEGER,
    "latencyMs" INTEGER,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "costCents" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelCall_connectionId_createdAt_idx" ON "ModelCall"("connectionId", "createdAt");
CREATE INDEX "ModelCall_applicationId_createdAt_idx" ON "ModelCall"("applicationId", "createdAt");
CREATE INDEX "ModelCall_trainerId_createdAt_idx" ON "ModelCall"("trainerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ModelCall"
  ADD CONSTRAINT "ModelCall_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "ModelConnection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ModelCall"
  ADD CONSTRAINT "ModelCall_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModelCall"
  ADD CONSTRAINT "ModelCall_jobRequestId_fkey"
  FOREIGN KEY ("jobRequestId") REFERENCES "JobRequest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModelCall"
  ADD CONSTRAINT "ModelCall_trainerId_fkey"
  FOREIGN KEY ("trainerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
