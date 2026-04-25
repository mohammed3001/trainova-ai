-- CreateEnum
CREATE TYPE "EvaluationStageKind" AS ENUM ('SCREENING', 'TEST', 'INTERVIEW', 'REVIEW');

-- CreateEnum
CREATE TYPE "EvaluationStageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ApplicationPipelineStatus" AS ENUM ('IN_PROGRESS', 'PASSED', 'FAILED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "EvaluationPipeline" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "EvaluationStageKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "testId" TEXT,
    "passingScore" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationPipelineProgress" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "ApplicationPipelineStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStageId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationPipelineProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationStageResult" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" "EvaluationStageStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "notes" TEXT,
    "reviewedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationStageResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationPipeline_requestId_key" ON "EvaluationPipeline"("requestId");

-- CreateIndex
CREATE INDEX "EvaluationPipeline_requestId_isActive_idx" ON "EvaluationPipeline"("requestId", "isActive");

-- CreateIndex
CREATE INDEX "EvaluationStage_pipelineId_idx" ON "EvaluationStage"("pipelineId");

-- CreateIndex
CREATE INDEX "EvaluationStage_testId_idx" ON "EvaluationStage"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationStage_pipelineId_order_key" ON "EvaluationStage"("pipelineId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationPipelineProgress_applicationId_key" ON "ApplicationPipelineProgress"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationPipelineProgress_pipelineId_status_idx" ON "ApplicationPipelineProgress"("pipelineId", "status");

-- CreateIndex
CREATE INDEX "ApplicationStageResult_progressId_idx" ON "ApplicationStageResult"("progressId");

-- CreateIndex
CREATE INDEX "ApplicationStageResult_stageId_status_idx" ON "ApplicationStageResult"("stageId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationStageResult_progressId_stageId_key" ON "ApplicationStageResult"("progressId", "stageId");

-- AddForeignKey
ALTER TABLE "EvaluationPipeline" ADD CONSTRAINT "EvaluationPipeline_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "JobRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationStage" ADD CONSTRAINT "EvaluationStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "EvaluationPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationStage" ADD CONSTRAINT "EvaluationStage_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPipelineProgress" ADD CONSTRAINT "ApplicationPipelineProgress_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "EvaluationPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPipelineProgress" ADD CONSTRAINT "ApplicationPipelineProgress_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageResult" ADD CONSTRAINT "ApplicationStageResult_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "ApplicationPipelineProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageResult" ADD CONSTRAINT "ApplicationStageResult_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "EvaluationStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageResult" ADD CONSTRAINT "ApplicationStageResult_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
