import type { Request, Response, NextFunction } from "express";
import type { AnnotationTrack } from "@prisma/client";
import * as syncEngine from "../services/syncEngine.service";
import { prisma } from "../config/prisma";

export async function listSyncPoints(req: Request, res: Response, next: NextFunction) {
  try {
    const points = await syncEngine.getSyncPoints(req.params.recordingId);
    res.json(points);
  } catch (err) {
    next(err);
  }
}

// Human-in-the-loop authoring: create or update an anchor point
export async function createSyncPoint(req: Request, res: Response, next: NextFunction) {
  try {
    const { recordingId } = req.params;
    const { scoreId, measureNumber, timestampSec, beatNumber } = req.body as {
      scoreId?: string;
      measureNumber?: number;
      timestampSec?: number;
      beatNumber?: number;
    };

    if (!scoreId || measureNumber == null || timestampSec == null) {
      return res
        .status(400)
        .json({ message: "scoreId, measureNumber, and timestampSec are required." });
    }

    const normalizedMeasure = Number(measureNumber);
    const normalizedTimestamp = Number(timestampSec);
    if (!Number.isFinite(normalizedMeasure) || normalizedMeasure < 1) {
      return res.status(400).json({ message: "measureNumber must be a positive number." });
    }
    if (!Number.isFinite(normalizedTimestamp) || normalizedTimestamp < 0) {
      return res.status(400).json({ message: "timestampSec must be zero or greater." });
    }

    const [recording, score] = await Promise.all([
      prisma.recording.findUnique({ where: { id: recordingId } }),
      prisma.score.findUnique({ where: { id: scoreId } }),
    ]);
    if (!recording) return res.status(404).json({ message: "Recording not found." });
    if (!score) return res.status(404).json({ message: "Score not found." });
    if (score.pieceId !== recording.pieceId) {
      return res.status(400).json({ message: "The score does not belong to this recording's piece." });
    }

    const point = await syncEngine.upsertSyncPoint({
      recordingId,
      scoreId,
      measureNumber: normalizedMeasure,
      timestampSec: normalizedTimestamp,
      beatNumber: beatNumber != null ? Number(beatNumber) : 1.0,
    });
    res.status(201).json(point);
  } catch (err) {
    next(err);
  }
}

export async function deleteSyncPoint(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await syncEngine.deleteSyncPoint(id);
    res.json({ success: true, message: "Sync point deleted." });
  } catch (err) {
    next(err);
  }
}

export async function validateMap(req: Request, res: Response, next: NextFunction) {
  try {
    const { recordingId } = req.params;
    const syncPoints = await syncEngine.getSyncPoints(recordingId);
    const validation = syncEngine.validateSyncMap(syncPoints);
    res.json({ syncPointsCount: syncPoints.length, ...validation });
  } catch (err) {
    next(err);
  }
}

// Playback-time lookup with interpolation
export async function getAnnotationAtTime(req: Request, res: Response, next: NextFunction) {
  try {
    const { recordingId } = req.params;
    const currentTimeSec = Number(req.query.t);
    const track: AnnotationTrack = req.query.track === "expert" ? "expert" : "layman";

    if (Number.isNaN(currentTimeSec)) {
      return res.status(400).json({ message: "Query param t (seconds) is required." });
    }

    const syncPoints = await syncEngine.getSyncPoints(recordingId);
    const interp = syncEngine.interpolateScorePosition(syncPoints, currentTimeSec);

    // If an active measure was interpolated, look up annotation for that measure
    let annotation = null;
    let annotations: any[] = [];
    if (interp.measureNumber != null) {
      annotation = await syncEngine.getAnnotationForMeasure(
        recordingId,
        interp.measureNumber,
        track,
        currentTimeSec
      );
      annotations = await prisma.annotation.findMany({
        where: {
          recordingId,
          track,
          OR: [
            {
              measureRangeStart: { lte: interp.measureNumber },
              measureRangeEnd: { gte: interp.measureNumber },
            },
            {
              startTimestampSec: { lte: currentTimeSec },
              OR: [
                { endTimestampSec: { gte: currentTimeSec } },
                { endTimestampSec: null },
              ],
            },
          ],
        },
        orderBy: [{ startTimestampSec: "asc" }, { createdAt: "asc" }],
      });
    } else {
      // Fallback: check if an annotation directly matches this timestamp range
      annotations = await prisma.annotation.findMany({
        where: {
          recordingId,
          track,
          startTimestampSec: { lte: currentTimeSec },
          OR: [
            { endTimestampSec: { gte: currentTimeSec } },
            { endTimestampSec: null },
          ],
        },
        orderBy: [{ startTimestampSec: "asc" }, { createdAt: "asc" }],
      });
      annotation = annotations[0] ?? null;
    }

    res.json({
      measureNumber: interp.measureNumber,
      continuousScorePosition: interp.continuousScorePosition,
      beatNumber: interp.beatNumber,
      interpolationStatus: interp.status,
      annotation,
      annotations,
    });
  } catch (err) {
    next(err);
  }
}

export async function listAnnotations(req: Request, res: Response, next: NextFunction) {
  try {
    const { recordingId } = req.params;
    const track = req.query.track as AnnotationTrack | undefined;
    const where: any = { recordingId };
    if (track) where.track = track;

    const annotations = await prisma.annotation.findMany({
      where,
      orderBy: [{ measureRangeStart: "asc" }, { startTimestampSec: "asc" }],
    });
    res.json(annotations);
  } catch (err) {
    next(err);
  }
}

export async function createAnnotation(req: Request, res: Response, next: NextFunction) {
  try {
    const { recordingId } = req.params;
    const {
      measureRangeStart,
      measureRangeEnd,
      startTimestampSec,
      endTimestampSec,
      section,
      subsection,
      annotationType,
      title,
      track,
      text,
      author,
    } = req.body as {
      measureRangeStart?: number;
      measureRangeEnd?: number;
      startTimestampSec?: number;
      endTimestampSec?: number;
      section?: string;
      subsection?: string;
      annotationType?: string;
      title?: string;
      track?: AnnotationTrack;
      text?: string;
      author?: string;
    };

    if (!track || !text) {
      return res.status(400).json({
        message: "track and text are required fields.",
      });
    }

    // Associate pieceId if recording exists
    const recording = await prisma.recording.findUnique({ where: { id: recordingId } });

    const annotation = await prisma.annotation.create({
      data: {
        recordingId,
        pieceId: recording?.pieceId,
        measureRangeStart: measureRangeStart != null ? Number(measureRangeStart) : null,
        measureRangeEnd: measureRangeEnd != null ? Number(measureRangeEnd) : null,
        startTimestampSec: startTimestampSec != null ? Number(startTimestampSec) : null,
        endTimestampSec: endTimestampSec != null ? Number(endTimestampSec) : null,
        section,
        subsection,
        annotationType,
        title,
        track,
        text,
        author,
      },
    });
    res.status(201).json(annotation);
  } catch (err) {
    next(err);
  }
}

export async function deleteAnnotation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await prisma.annotation.delete({ where: { id } });
    res.json({ success: true, message: "Annotation deleted." });
  } catch (err) {
    next(err);
  }
}

// Timestamp-analysis import preview
export async function previewTimestampImport(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = req.body as { content?: string };
    if (!content) {
      return res.status(400).json({ message: "File content string is required." });
    }
    const { parseTimestampAnalysisFile } = await import("../services/timestampImporter.service");
    const preview = parseTimestampAnalysisFile(content);
    res.json(preview);
  } catch (err) {
    next(err);
  }
}

// Commit timestamp-analysis import
export async function commitTimestampImportRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const { recordingId } = req.params;
    const { content, track, author } = req.body as {
      content?: string;
      track?: AnnotationTrack;
      author?: string;
    };

    if (!content) {
      return res.status(400).json({ message: "content string is required." });
    }

    const recording = await prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording) {
      return res.status(404).json({ message: "Recording not found." });
    }

    const { commitTimestampImport } = await import("../services/timestampImporter.service");
    const result = await commitTimestampImport({
      recordingId,
      pieceId: recording.pieceId,
      track: track === "layman" ? "layman" : "expert",
      content,
      author,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
