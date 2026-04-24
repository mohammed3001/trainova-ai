/*
  Warnings:

  - A unique constraint covering the columns `[testId,trainerId,applicationId]` on the table `TestAttempt` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TestAttempt_testId_trainerId_applicationId_key" ON "TestAttempt"("testId", "trainerId", "applicationId");
