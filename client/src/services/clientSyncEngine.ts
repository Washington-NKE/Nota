import type { Annotation, AnnotationTrack, SyncPoint } from "../types";

export interface InterpolationResult {
  measureNumber: number | null;
  continuousScorePosition: number | null;
  beatNumber: number | null;
  status: "exact_match" | "interpolated" | "before_first_anchor" | "after_last_anchor" | "empty_map" | "single_anchor";
  activeAnchorIndex: number | null;
}

/**
 * Client-side piecewise linear interpolation for low-latency playback synchronization (<100ms lag).
 * Evaluates entirely in-memory against locally cached anchors.
 */
export function interpolateScorePosition(
  rawAnchors: SyncPoint[],
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

  if (anchors.length === 1) {
    const only = anchors[0];
    if (currentTimeSec >= only.timestampSec) {
      return {
        measureNumber: only.measureNumber,
        continuousScorePosition: only.measureNumber,
        beatNumber: 1.0,
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

  if (currentTimeSec < first.timestampSec) {
    return {
      measureNumber: null,
      continuousScorePosition: null,
      beatNumber: null,
      status: "before_first_anchor",
      activeAnchorIndex: null,
    };
  }

  if (currentTimeSec >= last.timestampSec) {
    return {
      measureNumber: last.measureNumber,
      continuousScorePosition: last.measureNumber,
      beatNumber: 1.0,
      status: "after_last_anchor",
      activeAnchorIndex: anchors.length - 1,
    };
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a0 = anchors[i];
    const a1 = anchors[i + 1];

    if (currentTimeSec >= a0.timestampSec && currentTimeSec < a1.timestampSec) {
      const dt = a1.timestampSec - a0.timestampSec;
      if (dt <= 0) {
        return {
          measureNumber: a0.measureNumber,
          continuousScorePosition: a0.measureNumber,
          beatNumber: 1.0,
          status: "exact_match",
          activeAnchorIndex: i,
        };
      }

      const alpha = (currentTimeSec - a0.timestampSec) / dt;
      const continuousScorePosition = a0.measureNumber + alpha * (a1.measureNumber - a0.measureNumber);
      const measureNumber = Math.floor(continuousScorePosition);
      const fraction = continuousScorePosition - measureNumber;
      const beatNumber = Number((fraction * beatsPerMeasure + 1).toFixed(2));

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
    beatNumber: 1.0,
    status: "after_last_anchor",
    activeAnchorIndex: anchors.length - 1,
  };
}

/**
 * Finds the currently active annotation in memory.
 * Evaluates track filtering, measure ranges, and timestamp ranges.
 */
export function findActiveAnnotation(
  annotations: Annotation[],
  measureNumber: number | null,
  currentTimeSec: number,
  track: AnnotationTrack
): Annotation | null {
  return findActiveAnnotations(annotations, measureNumber, currentTimeSec, track)[0] ?? null;
}

export function findActiveAnnotations(
  annotations: Annotation[],
  measureNumber: number | null,
  currentTimeSec: number,
  track: AnnotationTrack
): Annotation[] {
  if (!annotations || annotations.length === 0) return [];

  // Filter by track first
  const trackAnnotations = annotations.filter((a) => a.track === track);
  const matches = trackAnnotations.filter((a) => {
    const measureMatch =
      measureNumber != null &&
      a.measureRangeStart != null &&
      a.measureRangeEnd != null &&
      a.measureRangeStart <= measureNumber &&
      a.measureRangeEnd >= measureNumber;

    if (measureMatch) return true;
    if (a.startTimestampSec == null) return false;
    if (currentTimeSec < a.startTimestampSec) return false;
    if (a.endTimestampSec == null) return true;
    return currentTimeSec <= a.endTimestampSec;
  });

  return matches;
}
