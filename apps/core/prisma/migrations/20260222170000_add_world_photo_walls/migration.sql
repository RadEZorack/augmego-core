-- CreateTable
CREATE TABLE "WorldPhotoWall" (
    "id" UUID NOT NULL,
    "worldOwnerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageStorageKey" TEXT,
    "imageContentType" TEXT,
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

    CONSTRAINT "WorldPhotoWall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorldPhotoWall_worldOwnerId_updatedAt_idx" ON "WorldPhotoWall"("worldOwnerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "WorldPhotoWall" ADD CONSTRAINT "WorldPhotoWall_worldOwnerId_fkey" FOREIGN KEY ("worldOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPhotoWall" ADD CONSTRAINT "WorldPhotoWall_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
