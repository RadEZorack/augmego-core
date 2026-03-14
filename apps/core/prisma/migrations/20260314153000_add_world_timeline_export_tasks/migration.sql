-- CreateTable
CREATE TABLE "WorldTimelineExportTask" (
    "id" UUID NOT NULL,
    "worldOwnerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "WorldAssetGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "sourceStorageKey" TEXT NOT NULL,
    "sourceContentType" TEXT,
    "outputStorageKey" TEXT,
    "outputContentType" TEXT,
    "outputFileName" TEXT,
    "processingStatus" TEXT,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldTimelineExportTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorldTimelineExportTask_status_updatedAt_idx" ON "WorldTimelineExportTask"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldTimelineExportTask_worldOwnerId_createdAt_idx" ON "WorldTimelineExportTask"("worldOwnerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldTimelineExportTask_createdById_createdAt_idx" ON "WorldTimelineExportTask"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "WorldTimelineExportTask" ADD CONSTRAINT "WorldTimelineExportTask_worldOwnerId_fkey" FOREIGN KEY ("worldOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldTimelineExportTask" ADD CONSTRAINT "WorldTimelineExportTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
