CREATE TYPE "WorldAssetVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "WorldAsset"
ADD COLUMN "visibility" "WorldAssetVisibility" NOT NULL DEFAULT 'PUBLIC';

ALTER TABLE "WorldAssetGenerationTask"
ADD COLUMN "visibility" "WorldAssetVisibility" NOT NULL DEFAULT 'PUBLIC';

CREATE INDEX "WorldAsset_visibility_updatedAt_idx" ON "WorldAsset"("visibility", "updatedAt");
