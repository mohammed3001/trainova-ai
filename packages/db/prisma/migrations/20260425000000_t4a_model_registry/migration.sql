-- CreateEnum
CREATE TYPE "ModelProvider" AS ENUM ('OPENAI_COMPATIBLE', 'ANTHROPIC', 'BEDROCK', 'HUGGINGFACE', 'RAW_HTTPS');

-- CreateEnum
CREATE TYPE "ModelConnectionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "ModelConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "ModelProvider" NOT NULL,
    "endpointUrl" TEXT,
    "modelId" TEXT,
    "region" TEXT,
    "authKind" TEXT NOT NULL DEFAULT 'api_key',
    "encryptedCredentials" BYTEA,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "ModelConnectionStatus" NOT NULL DEFAULT 'DRAFT',
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "lastCheckError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ModelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelConnection_companyId_deletedAt_idx" ON "ModelConnection"("companyId", "deletedAt");

-- AddForeignKey
ALTER TABLE "ModelConnection" ADD CONSTRAINT "ModelConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

