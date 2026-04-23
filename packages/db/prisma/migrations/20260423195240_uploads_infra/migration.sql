-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT;

-- CreateTable
CREATE TABLE "TrainerAsset" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAttachment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "title" TEXT,
    "scanStatus" TEXT NOT NULL DEFAULT 'pending',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAsset_objectKey_key" ON "TrainerAsset"("objectKey");

-- CreateIndex
CREATE INDEX "TrainerAsset_profileId_deletedAt_order_idx" ON "TrainerAsset"("profileId", "deletedAt", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationAttachment_objectKey_key" ON "ApplicationAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "ApplicationAttachment_applicationId_deletedAt_idx" ON "ApplicationAttachment"("applicationId", "deletedAt");

-- AddForeignKey
ALTER TABLE "TrainerAsset" ADD CONSTRAINT "TrainerAsset_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAttachment" ADD CONSTRAINT "ApplicationAttachment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
