-- CreateTable
CREATE TABLE "WorldPost" (
    "id" UUID NOT NULL,
    "worldOwnerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "positionZ" DOUBLE PRECISION NOT NULL,
    "isMinimized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorldPost_worldOwnerId_updatedAt_idx" ON "WorldPost"("worldOwnerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "WorldPost" ADD CONSTRAINT "WorldPost_worldOwnerId_fkey" FOREIGN KEY ("worldOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPost" ADD CONSTRAINT "WorldPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
