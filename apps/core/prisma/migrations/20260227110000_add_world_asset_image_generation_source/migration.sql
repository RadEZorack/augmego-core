ALTER TABLE "WorldAssetGenerationTask"
  ADD COLUMN "generationSource" TEXT NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "sourceImageUrl" TEXT,
  ADD COLUMN "sourceImageStorageKey" TEXT,
  ADD COLUMN "sourceImageContentType" TEXT;
