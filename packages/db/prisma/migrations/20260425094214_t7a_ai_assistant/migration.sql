-- CreateEnum
CREATE TYPE "AiAssistKind" AS ENUM ('REQUEST_DRAFT', 'APPLICATION_SCREEN', 'CHAT_SUMMARY', 'CHAT_TASKS', 'SEO_META', 'EMAIL_DRAFT', 'PRICING_SUGGEST', 'TEST_GEN', 'PROFILE_OPT');

-- CreateEnum
CREATE TYPE "AiAssistStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "AiAssistRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AiAssistKind" NOT NULL,
    "status" "AiAssistStatus" NOT NULL DEFAULT 'PENDING',
    "modelUsed" TEXT,
    "provider" TEXT,
    "inputJson" JSONB NOT NULL,
    "outputJson" JSONB,
    "error" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "contextEntityType" TEXT,
    "contextEntityId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAssistRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiAssistRequest_userId_kind_createdAt_idx" ON "AiAssistRequest"("userId", "kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiAssistRequest_contextEntityType_contextEntityId_idx" ON "AiAssistRequest"("contextEntityType", "contextEntityId");

-- CreateIndex
CREATE INDEX "AiAssistRequest_status_idx" ON "AiAssistRequest"("status");

-- AddForeignKey
ALTER TABLE "AiAssistRequest" ADD CONSTRAINT "AiAssistRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
