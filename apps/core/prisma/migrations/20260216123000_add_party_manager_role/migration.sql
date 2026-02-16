-- CreateEnum
CREATE TYPE "PartyMemberRole" AS ENUM ('MEMBER', 'MANAGER');

-- AlterTable
ALTER TABLE "PartyMember"
ADD COLUMN "role" "PartyMemberRole" NOT NULL DEFAULT 'MEMBER';
