import { api } from "./api";
import type {
  AnnotationAtTimeResponse,
  Piece,
  Score,
  SyncPoint,
  Annotation,
  AnnotationTrack,
  CommentItem,
} from "../types";

export const getPieces = (): Promise<Piece[]> =>
  api.get<Piece[]>("/pieces").then((r) => r.data);

export const getSavedPieces = (): Promise<Piece[]> =>
  api.get<Piece[]>("/pieces/saved").then((r) => r.data);

export const searchPieces = (q: string): Promise<Piece[]> =>
  api.get<Piece[]>("/pieces/search", { params: { q } }).then((r) => r.data);

export const getPiece = (id: string): Promise<Piece> =>
  api.get<Piece>(`/pieces/${id}`).then((r) => r.data);

export const toggleSave = (pieceId: string, saved: boolean): Promise<void> =>
  saved
    ? api.delete(`/pieces/${pieceId}/save`).then(() => undefined)
    : api.post(`/pieces/${pieceId}/save`).then(() => undefined);

// Score endpoints
export const getScore = (pieceId: string): Promise<Score> =>
  api.get<Score>(`/scores/${pieceId}`).then((r) => r.data);

export const getScoreXml = (scoreId: string): Promise<string> =>
  api
    .get<string>(`/scores/${scoreId}/xml`, { responseType: "text" })
    .then((r) => r.data);

export const uploadScore = (pieceId: string, file: File): Promise<{ score: Score }> => {
  const formData = new FormData();
  formData.append("file", file);
  return api
    .post(`/scores/${pieceId}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

// Synchronization map endpoints
export const getSyncPoints = (recordingId: string): Promise<SyncPoint[]> =>
  api.get<SyncPoint[]>(`/recordings/${recordingId}/sync-points`).then((r) => r.data);

export const createSyncPoint = (
  recordingId: string,
  data: { scoreId: string; measureNumber: number; timestampSec: number; beatNumber?: number }
): Promise<SyncPoint> =>
  api.post<SyncPoint>(`/recordings/${recordingId}/sync-points`, data).then((r) => r.data);

export const deleteSyncPoint = (id: string): Promise<void> =>
  api.delete(`/recordings/sync-points/${id}`).then(() => undefined);

export const validateSyncMapApi = (recordingId: string) =>
  api.get(`/recordings/${recordingId}/sync-points/validate`).then((r) => r.data);

// Annotations
export const getAnnotations = (
  recordingId: string,
  track?: AnnotationTrack
): Promise<Annotation[]> =>
  api
    .get<Annotation[]>(`/recordings/${recordingId}/annotations`, { params: { track } })
    .then((r) => r.data);

export const getAnnotationAtTime = (
  recordingId: string,
  timestampSec: number,
  track: AnnotationTrack
): Promise<AnnotationAtTimeResponse> =>
  api
    .get<AnnotationAtTimeResponse>(`/recordings/${recordingId}/annotation-at-time`, {
      params: { t: timestampSec, track },
    })
    .then((r) => r.data);

// Comments
export const getPieceComments = (pieceId: string): Promise<CommentItem[]> =>
  api.get<CommentItem[]>(`/pieces/${pieceId}/comments`).then((r) => r.data);

export const getRecordingComments = (recordingId: string): Promise<CommentItem[]> =>
  api.get<CommentItem[]>(`/recordings/${recordingId}/comments`).then((r) => r.data);

export const createCommentApi = (data: {
  pieceId?: string;
  recordingId?: string;
  parentId?: string;
  body: string;
  timestampSec?: number;
  measureNumber?: number;
}): Promise<CommentItem> =>
  data.recordingId
    ? api.post<CommentItem>(`/recordings/${data.recordingId}/comments`, data).then((r) => r.data)
    : api.post<CommentItem>(`/pieces/${data.pieceId}/comments`, data).then((r) => r.data);

export const deleteCommentApi = (commentId: string): Promise<void> =>
  api.delete(`/comments/${commentId}`).then(() => undefined);

export const updateCommentApi = (commentId: string, body: string): Promise<CommentItem> =>
  api.patch<CommentItem>(`/comments/${commentId}`, { body }).then((r) => r.data);

export const previewTimestampImport = (
  recordingId: string,
  content: string
): Promise<{ fingerprint: string; itemCount: number; sections: string[]; durationEstimateSec: number; items: Annotation[]; warnings?: string[] }> =>
  api
    .post(`/recordings/${recordingId}/import-timestamps/preview`, { content })
    .then((r) => r.data);

export const commitTimestampImport = (
  recordingId: string,
  content: string,
  track: AnnotationTrack
): Promise<{ success: boolean; alreadyImported: boolean; importedCount: number }> =>
  api
    .post(`/recordings/${recordingId}/import-timestamps/commit`, { content, track })
    .then((r) => r.data);

// Comparison
export const compareRecordings = (pieceId: string, recordingIds?: string[]) =>
  api
    .get(`/pieces/${pieceId}/compare`, {
      params: { recordings: recordingIds?.join(",") },
    })
    .then((r) => r.data);
