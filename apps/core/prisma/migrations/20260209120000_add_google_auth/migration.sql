-- AlterTable
ALTER TABLE "User" ALTER COLUMN "linkedinId" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
