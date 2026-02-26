ALTER TABLE "WorldAssetGenerationTask"
  ADD COLUMN "generationType" TEXT NOT NULL DEFAULT 'OBJECT',
  ADD COLUMN "meshyRiggedModelUrl" TEXT,
  ADD COLUMN "meshyAnimationIndex" INTEGER NOT NULL DEFAULT 0;
