-- AlterTable
ALTER TABLE "WorldPost"
ADD COLUMN "imageStorageKey" TEXT,
ADD COLUMN "imageContentType" TEXT;

-- CreateTable
CREATE TABLE "WorldPostComment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "worldOwnerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorldPostComment_postId_createdAt_idx" ON "WorldPostComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldPostComment_worldOwnerId_createdAt_idx" ON "WorldPostComment"("worldOwnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorldPostComment" ADD CONSTRAINT "WorldPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "WorldPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPostComment" ADD CONSTRAINT "WorldPostComment_worldOwnerId_fkey" FOREIGN KEY ("worldOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPostComment" ADD CONSTRAINT "WorldPostComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
