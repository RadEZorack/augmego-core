-- CreateEnum
CREATE TYPE "WorldAssetGenerationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "WorldAssetGenerationTask" (
    "id" UUID NOT NULL,
    "worldOwnerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "WorldAssetGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "meshyTaskId" TEXT,
    "meshyStatus" TEXT,
    "generatedAssetId" UUID,
    "generatedVersionId" UUID,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldAssetGenerationTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldAssetGenerationTask_meshyTaskId_key" ON "WorldAssetGenerationTask"("meshyTaskId");

-- CreateIndex
CREATE INDEX "WorldAssetGenerationTask_status_updatedAt_idx" ON "WorldAssetGenerationTask"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldAssetGenerationTask_worldOwnerId_createdAt_idx" ON "WorldAssetGenerationTask"("worldOwnerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldAssetGenerationTask_createdById_createdAt_idx" ON "WorldAssetGenerationTask"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "WorldAssetGenerationTask" ADD CONSTRAINT "WorldAssetGenerationTask_worldOwnerId_fkey" FOREIGN KEY ("worldOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAssetGenerationTask" ADD CONSTRAINT "WorldAssetGenerationTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
