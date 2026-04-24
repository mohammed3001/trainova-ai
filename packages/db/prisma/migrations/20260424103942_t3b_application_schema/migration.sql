-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "answers" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "JobRequest" ADD COLUMN     "applicationSchema" JSONB;
