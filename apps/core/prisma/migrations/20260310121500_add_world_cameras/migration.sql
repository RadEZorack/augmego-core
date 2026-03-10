CREATE TABLE "WorldCamera" (
  "id" UUID NOT NULL,
  "worldOwnerId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" TEXT,
  "positionX" DOUBLE PRECISION NOT NULL,
  "positionY" DOUBLE PRECISION NOT NULL,
  "positionZ" DOUBLE PRECISION NOT NULL,
  "lookAtX" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lookAtY" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lookAtZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorldCamera_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorldCamera_worldOwnerId_updatedAt_idx" ON "WorldCamera"("worldOwnerId", "updatedAt");

ALTER TABLE "WorldCamera"
ADD CONSTRAINT "WorldCamera_worldOwnerId_fkey"
FOREIGN KEY ("worldOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorldCamera"
ADD CONSTRAINT "WorldCamera_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
