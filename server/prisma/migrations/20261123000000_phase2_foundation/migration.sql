CREATE TYPE "UserRole" AS ENUM ('listener', 'analyst', 'admin');

ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'listener';

ALTER TABLE "Score"
  ADD COLUMN "versionLabel" TEXT,
  ADD COLUMN "sourceFileName" TEXT,
  ADD COLUMN "sourceFingerprint" TEXT,
  ADD COLUMN "isCanonical" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Score_pieceId_isCanonical_idx" ON "Score"("pieceId", "isCanonical");
CREATE INDEX "Score_sourceFingerprint_idx" ON "Score"("sourceFingerprint");

ALTER TABLE "ScoreMeasure"
  ADD COLUMN "scorePartId" TEXT,
  ADD COLUMN "originalNumber" TEXT,
  ADD COLUMN "positionIndex" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isPickup" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ScoreMeasure"
  ADD CONSTRAINT "ScoreMeasure_scorePartId_fkey"
  FOREIGN KEY ("scorePartId") REFERENCES "ScorePart"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ScoreMeasure_scoreId_scorePartId_positionIndex_idx"
  ON "ScoreMeasure"("scoreId", "scorePartId", "positionIndex");

ALTER TABLE "Recording"
  ADD COLUMN "scoreId" TEXT;

ALTER TABLE "Recording"
  ADD CONSTRAINT "Recording_scoreId_fkey"
  FOREIGN KEY ("scoreId") REFERENCES "Score"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Recording_scoreId_idx" ON "Recording"("scoreId");

CREATE TABLE "SynchronizationMap" (
  "id" TEXT NOT NULL,
  "recordingId" TEXT NOT NULL,
  "scoreId" TEXT,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "validatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SynchronizationMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SynchronizationMap_recordingId_key"
  ON "SynchronizationMap"("recordingId");
CREATE INDEX "SynchronizationMap_scoreId_idx" ON "SynchronizationMap"("scoreId");

ALTER TABLE "SynchronizationMap"
  ADD CONSTRAINT "SynchronizationMap_recordingId_fkey"
  FOREIGN KEY ("recordingId") REFERENCES "Recording"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SynchronizationMap"
  ADD CONSTRAINT "SynchronizationMap_scoreId_fkey"
  FOREIGN KEY ("scoreId") REFERENCES "Score"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SynchronizationMap" ("id", "recordingId", "scoreId", "isVerified", "createdAt", "updatedAt")
SELECT
  'syncmap-' || r."id",
  r."id",
  COALESCE(r."scoreId", s."id"),
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Recording" r
LEFT JOIN LATERAL (
  SELECT sc."id"
  FROM "Score" sc
  WHERE sc."pieceId" = r."pieceId"
  ORDER BY sc."createdAt" ASC
  LIMIT 1
) s ON true
ON CONFLICT ("recordingId") DO NOTHING;

UPDATE "Recording" r
SET "scoreId" = sm."scoreId"
FROM "SynchronizationMap" sm
WHERE sm."recordingId" = r."id";

UPDATE "Score" s
SET "isCanonical" = true
WHERE s."id" IN (
  SELECT DISTINCT ON (sc."pieceId") sc."id"
  FROM "Score" sc
  ORDER BY sc."pieceId", sc."createdAt" ASC
);

ALTER TABLE "SyncPoint"
  ADD COLUMN "synchronizationMapId" TEXT,
  ADD COLUMN "scorePosition" DOUBLE PRECISION;

ALTER TABLE "SyncPoint"
  ADD CONSTRAINT "SyncPoint_synchronizationMapId_fkey"
  FOREIGN KEY ("synchronizationMapId") REFERENCES "SynchronizationMap"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "SyncPoint_synchronizationMapId_timestampSec_idx"
  ON "SyncPoint"("synchronizationMapId", "timestampSec");

UPDATE "SyncPoint" sp
SET "synchronizationMapId" = sm."id",
    "scorePosition" = sp."measureNumber"::DOUBLE PRECISION
FROM "SynchronizationMap" sm
WHERE sm."recordingId" = sp."recordingId";

ALTER TABLE "Annotation"
  ADD COLUMN "scoreId" TEXT,
  ADD COLUMN "scorePositionStart" DOUBLE PRECISION,
  ADD COLUMN "scorePositionEnd" DOUBLE PRECISION;

ALTER TABLE "Annotation"
  ADD CONSTRAINT "Annotation_scoreId_fkey"
  FOREIGN KEY ("scoreId") REFERENCES "Score"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
