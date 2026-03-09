ALTER TABLE "Party"
ADD COLUMN "timelineFrames" JSONB NOT NULL DEFAULT '[]'::jsonb;
