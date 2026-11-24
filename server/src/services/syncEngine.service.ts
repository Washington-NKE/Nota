import { prisma } from "../config/prisma";
import type { SyncPoint, Annotation, AnnotationTrack } from "@prisma/client";

export interface SyncAnchor {
  measureNumber: number;
  timestampSec: number;
  beatNumber?: number | null;
  confidence?: number | null;
}

export interface InterpolationResult {
  measureNumber: number | null;
  continuousScorePosition: number | null;
  beatNumber: number | null;
  status: "exact_match" | "interpolated" | "before_first_anchor" | "after_last_anchor" | "empty_map" | "single_anchor";
  activeAnchorIndex: number | null;
}

export interface SyncMapValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a synchronization map of anchors:
 * - Checks for strictly increasing timestamps
 * - Checks for monotonically non-decreasing score measure positions
 * - Detects duplicates and intervals
 */
export function validateSyncMap(anchors: SyncAnchor[]): SyncMapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!anchors || anchors.length === 0) {
    return { isValid: true, errors: [], warnings: ["Synchronization map is empty."] };
  }

  if (anchors.length === 1) {
    return { isValid: true, errors: [], warnings: ["Synchronization map contains only a single anchor."] };
  }

  for (let i = 0; i < anchors.length; i++) {
    const cur = anchors[i];
    if (cur.timestampSec < 0) {
      errors.push(`Anchor at index ${i} has negative timestamp: ${cur.timestampSec}s`);
    }
    if (cur.measureNumber < 0) {
      errors.push(`Anchor at index ${i} has negative measure number: ${cur.measureNumber}`);
    }

    if (i > 0) {
      const prev = anchors[i - 1];
      if (cur.timestampSec <= prev.timestampSec) {
        errors.push(
          `Timestamps out of order or duplicate at index ${i}: prev=${prev.timestampSec}s, cur=${cur.timestampSec}s`
        );
      }
      if (cur.measureNumber < prev.measureNumber) {
        errors.push(
          `Measure numbers decreasing at index ${i}: prev=m.${prev.measureNumber}, cur=m.${cur.measureNumber}`
        );
      }
      if (cur.measureNumber === prev.measureNumber) {
        warnings.push(`Multiple anchors assigned to measure ${cur.measureNumber}.`);
      }
      if (cur.timestampSec - prev.timestampSec > 60) {
        warnings.push(
          `Large temporal gap (${(cur.timestampSec - prev.timestampSec).toFixed(1)}s) between measure ${prev.measureNumber} and ${cur.measureNumber}.`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Piecewise linear interpolation between consecutive verified synchronization anchors.
 *
 * Given a sorted sequence of anchors (timestampSec, measureNumber) and query time t:
 * - If empty: returns null
 * - If t < first anchor: returns 'before_first_anchor' without unreliable extrapolation
 * - If t > last anchor: returns 'after_last_anchor' pinned to last measure
 * - Between anchors (t_i, m_i) and (t_{i+1}, m_{i+1}):
 *     alpha = (t - t_i) / (t_{i+1} - t_i)
 *     pos = m_i + alpha * (m_{i+1} - m_i)
 *     measure = floor(pos)
 */
export function interpolateScorePosition(
  rawAnchors: SyncAnchor[],
  currentTimeSec: number,
  beatsPerMeasure: number = 4
): InterpolationResult {
  if (!rawAnchors || rawAnchors.length === 0) {
    return {
      measureNumber: null,
      continuousScorePosition: null,
      beatNumber: null,
      status: "empty_map",
      activeAnchorIndex: null,
    };
  }

  // Ensure anchors are sorted ascending by timestampSec
  const anchors = [...rawAnchors].sort((a, b) => a.timestampSec - b.timestampSec);

  // Single anchor
  if (anchors.length === 1) {
    const only = anchors[0];
    if (currentTimeSec >= only.timestampSec) {
      return {
        measureNumber: only.measureNumber,
        continuousScorePosition: only.measureNumber,
        beatNumber: only.beatNumber ?? 1.0,
        status: "single_anchor",
        activeAnchorIndex: 0,
      };
    }
    return {
      measureNumber: null,
      continuousScorePosition: null,
      beatNumber: null,
      status: "before_first_anchor",
      activeAnchorIndex: null,
    };
  }

  const first = anchors[0];
  const last = anchors[anchors.length - 1];

  // Time is before the first verified anchor
  if (currentTimeSec < first.timestampSec) {
    return {
      measureNumber: null,
      continuousScorePosition: null,
      beatNumber: null,
      status: "before_first_anchor",
      activeAnchorIndex: null,
    };
  }

  // Time is at or after the last verified anchor
  if (currentTimeSec >= last.timestampSec) {
    return {
      measureNumber: last.measureNumber,
      continuousScorePosition: last.measureNumber,
      beatNumber: last.beatNumber ?? 1.0,
      status: "after_last_anchor",
      activeAnchorIndex: anchors.length - 1,
    };
  }

  // Find interval [i, i+1] where anchors[i].timestampSec <= currentTimeSec < anchors[i+1].timestampSec
  for (let i = 0; i < anchors.length - 1; i++) {
    const a0 = anchors[i];
    const a1 = anchors[i + 1];

    if (currentTimeSec >= a0.timestampSec && currentTimeSec < a1.timestampSec) {
      const dt = a1.timestampSec - a0.timestampSec;
      if (dt <= 0) {
        // Division by zero safeguard
        return {
          measureNumber: a0.measureNumber,
          continuousScorePosition: a0.measureNumber,
          beatNumber: a0.beatNumber ?? 1.0,
          status: "exact_match",
          activeAnchorIndex: i,
        };
      }

      const alpha = (currentTimeSec - a0.timestampSec) / dt;
      const continuousScorePosition = a0.measureNumber + alpha * (a1.measureNumber - a0.measureNumber);
      const measureNumber = Math.floor(continuousScorePosition);
      const fractionInMeasure = continuousScorePosition - measureNumber;
      const beatNumber = Number((fractionInMeasure * beatsPerMeasure + 1).toFixed(2));

      return {
        measureNumber,
        continuousScorePosition: Number(continuousScorePosition.toFixed(3)),
        beatNumber,
        status: alpha === 0 ? "exact_match" : "interpolated",
        activeAnchorIndex: i,
      };
    }
  }

  return {
    measureNumber: last.measureNumber,
    continuousScorePosition: last.measureNumber,
    beatNumber: last.beatNumber ?? 1.0,
    status: "after_last_anchor",
    activeAnchorIndex: anchors.length - 1,
  };
}

/**
 * Resolves the active measure number at a given timestamp using piecewise linear interpolation.
 */
export function resolveMeasureAtTime(
  syncPoints: Pick<SyncPoint, "timestampSec" | "measureNumber">[],
  currentTimeSec: number
): number | null {
  const result = interpolateScorePosition(syncPoints, currentTimeSec);
  return result.measureNumber;
}

export function getSyncPoints(recordingId: string): Promise<SyncPoint[]> {
  return prisma.syncPoint.findMany({
    where: { recordingId },
    orderBy: { timestampSec: "asc" },
  });
}

export interface UpsertSyncPointInput {
  recordingId: string;
  scoreId: string;
  measureNumber: number;
  timestampSec: number;
  beatNumber?: number | null;
}

/**
 * Human-in-the-loop authoring: create or correct a single anchor point.
 * Upserts on (recordingId, measureNumber) so re-anchoring a measure
 * updates the existing anchor.
 */
export function upsertSyncPoint({
  recordingId,
  scoreId,
  measureNumber,
  timestampSec,
  beatNumber,
}: UpsertSyncPointInput): Promise<SyncPoint> {
  return prisma.$transaction(async (tx) => {
    const syncMap = await tx.synchronizationMap.upsert({
      where: { recordingId },
      update: { scoreId },
      create: { recordingId, scoreId },
    });

    return tx.syncPoint.upsert({
      where: {
        recordingId_measureNumber: { recordingId, measureNumber },
      },
      update: {
        timestampSec,
        scoreId,
        synchronizationMapId: syncMap.id,
        beatNumber: beatNumber ?? 1.0,
        scorePosition: measureNumber + ((beatNumber ?? 1.0) - 1.0) / 4,
      },
      create: {
        recordingId,
        scoreId,
        synchronizationMapId: syncMap.id,
        measureNumber,
        timestampSec,
        beatNumber: beatNumber ?? 1.0,
        scorePosition: measureNumber + ((beatNumber ?? 1.0) - 1.0) / 4,
      },
    });
  });
}

export function deleteSyncPoint(id: string): Promise<SyncPoint> {
  return prisma.syncPoint.delete({ where: { id } });
}

/**
 * Look up the active annotation covering a given measure or timestamp for a given track.
 */
export async function getAnnotationForMeasure(
  recordingId: string,
  measureNumber: number,
  track: AnnotationTrack,
  currentTimeSec?: number
): Promise<Annotation | null> {
  // First attempt measure-range based match
  const measureMatch = await prisma.annotation.findFirst({
    where: {
      recordingId,
      track,
      measureRangeStart: { lte: measureNumber },
      measureRangeEnd: { gte: measureNumber },
    },
    orderBy: { createdAt: "desc" },
  });

  if (measureMatch) return measureMatch;

  // Fallback to timestamp range if currentTimeSec is available
  if (currentTimeSec != null) {
    const timeMatch = await prisma.annotation.findFirst({
      where: {
        recordingId,
        track,
        startTimestampSec: { lte: currentTimeSec },
        endTimestampSec: { gte: currentTimeSec },
      },
      orderBy: { startTimestampSec: "asc" },
    });
    if (timeMatch) return timeMatch;
  }

  return null;
}
