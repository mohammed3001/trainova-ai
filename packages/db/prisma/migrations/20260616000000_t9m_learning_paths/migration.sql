-- CreateEnum
CREATE TYPE "LearningPathLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "LearningStepKind" AS ENUM ('ARTICLE', 'LINK', 'VIDEO', 'REFLECTION');

-- CreateTable
CREATE TABLE "LearningPath" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "level" "LearningPathLevel" NOT NULL DEFAULT 'BEGINNER',
    "industry" TEXT,
    "estimatedHours" INTEGER NOT NULL DEFAULT 2,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningStep" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "LearningStepKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LearningEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningStepProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reflection" TEXT,

    CONSTRAINT "LearningStepProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningCertificate" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearningPath_slug_key" ON "LearningPath"("slug");

-- CreateIndex
CREATE INDEX "LearningPath_isPublished_publishedAt_idx" ON "LearningPath"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "LearningPath_level_isPublished_idx" ON "LearningPath"("level", "isPublished");

-- CreateIndex
CREATE INDEX "LearningStep_pathId_idx" ON "LearningStep"("pathId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningStep_pathId_position_key" ON "LearningStep"("pathId", "position");

-- CreateIndex
CREATE INDEX "LearningEnrollment_userId_completedAt_idx" ON "LearningEnrollment"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "LearningEnrollment_pathId_completedAt_idx" ON "LearningEnrollment"("pathId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningEnrollment_userId_pathId_key" ON "LearningEnrollment"("userId", "pathId");

-- CreateIndex
CREATE INDEX "LearningStepProgress_stepId_idx" ON "LearningStepProgress"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningStepProgress_enrollmentId_stepId_key" ON "LearningStepProgress"("enrollmentId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningCertificate_enrollmentId_key" ON "LearningCertificate"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningCertificate_serial_key" ON "LearningCertificate"("serial");

-- CreateIndex
CREATE INDEX "LearningCertificate_issuedAt_idx" ON "LearningCertificate"("issuedAt");

-- AddForeignKey
ALTER TABLE "LearningPath" ADD CONSTRAINT "LearningPath_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningStep" ADD CONSTRAINT "LearningStep_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEnrollment" ADD CONSTRAINT "LearningEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEnrollment" ADD CONSTRAINT "LearningEnrollment_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningStepProgress" ADD CONSTRAINT "LearningStepProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "LearningEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningStepProgress" ADD CONSTRAINT "LearningStepProgress_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "LearningStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningCertificate" ADD CONSTRAINT "LearningCertificate_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "LearningEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

