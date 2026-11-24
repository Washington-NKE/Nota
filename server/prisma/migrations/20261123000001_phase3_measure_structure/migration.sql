ALTER TABLE "ScoreMeasure" DROP CONSTRAINT IF EXISTS "ScoreMeasure_scoreId_measureNumber_key";

ALTER TABLE "ScoreMeasure"
  ADD COLUMN IF NOT EXISTS "restCount" INTEGER NOT NULL DEFAULT 0;
