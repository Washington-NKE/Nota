export type AnnotationTrack = "layman" | "expert";

export interface Piece {
  _id?: string;
  id: string;
  title: string;
  composer: string;
  year?: number | null;
  coverUrl?: string | null;
  performer?: string;
  recordings?: Recording[];
  scores?: Score[];
  savedByCurrentUser?: boolean;
}

export interface ScorePart {
  id: string;
  scoreId: string;
  partId: string;
  name: string;
  instrument?: string | null;
}

export interface Score {
  id: string;
  pieceId: string;
  title?: string | null;
  musicXmlUrl: string;
  musicXmlContent?: string | null;
  measureCount: number;
  parts?: ScorePart[];
}

export interface Recording {
  id: string;
  pieceId: string;
  performer: string;
  year?: number | null;
  provider: string;
  youtubeVideoId: string;
  durationSec?: number | null;
  providerUrl?: string;
  annotations?: Annotation[];
  syncPoints?: SyncPoint[];
}

export interface SyncPoint {
  id: string;
  recordingId: string;
  scoreId: string;
  measureNumber: number;
  beatNumber?: number | null;
  timestampSec: number;
}

export interface Annotation {
  _id?: string;
  id: string;
  recordingId?: string | null;
  pieceId?: string | null;
  measureRangeStart?: number | null;
  measureRangeEnd?: number | null;
  startTimestampSec?: number | null;
  endTimestampSec?: number | null;
  section?: string | null;
  subsection?: string | null;
  annotationType?: string | null;
  title?: string | null;
  track: AnnotationTrack;
  text: string;
  author?: string | null;
}

export interface AnnotationAtTimeResponse {
  measureNumber: number | null;
  continuousScorePosition?: number | null;
  beatNumber?: number | null;
  interpolationStatus?: string;
  annotation: Annotation | null;
  annotations?: Annotation[];
}

export interface CommentItem {
  id: string;
  userId: string;
  user?: { id: string; name?: string | null };
  recordingId?: string | null;
  pieceId?: string | null;
  parentId?: string | null;
  timestampSec?: number | null;
  measureNumber?: number | null;
  body: string;
  createdAt: string;
  replies?: CommentItem[];
}

export interface AuthResponse {
  token?: string;
  user?: { id: string; email?: string; name?: string };
}
