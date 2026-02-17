-- CreateTable
CREATE TABLE "WorldAsset" (
    "id" UUID NOT NULL,
    "worldOwnerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currentVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldAssetVersion" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldAssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldPlacement" (
    "id" UUID NOT NULL,
    "worldOwnerId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "positionZ" DOUBLE PRECISION NOT NULL,
    "rotationX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotationY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotationZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleZ" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldAsset_currentVersionId_key" ON "WorldAsset"("currentVersionId");

-- CreateIndex
CREATE INDEX "WorldAsset_worldOwnerId_updatedAt_idx" ON "WorldAsset"("worldOwnerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldAssetVersion_storageKey_key" ON "WorldAssetVersion"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorldAssetVersion_assetId_version_key" ON "WorldAssetVersion"("assetId", "version");

-- CreateIndex
CREATE INDEX "WorldAssetVersion_assetId_createdAt_idx" ON "WorldAssetVersion"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldPlacement_worldOwnerId_updatedAt_idx" ON "WorldPlacement"("worldOwnerId", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldPlacement_assetId_idx" ON "WorldPlacement"("assetId");

-- AddForeignKey
ALTER TABLE "WorldAsset" ADD CONSTRAINT "WorldAsset_worldOwnerId_fkey" FOREIGN KEY ("worldOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAsset" ADD CONSTRAINT "WorldAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAssetVersion" ADD CONSTRAINT "WorldAssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "WorldAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAssetVersion" ADD CONSTRAINT "WorldAssetVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPlacement" ADD CONSTRAINT "WorldPlacement_worldOwnerId_fkey" FOREIGN KEY ("worldOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPlacement" ADD CONSTRAINT "WorldPlacement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "WorldAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPlacement" ADD CONSTRAINT "WorldPlacement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAsset" ADD CONSTRAINT "WorldAsset_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "WorldAssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
