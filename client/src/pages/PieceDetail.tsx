import { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import LevelSelector from "../components/piece/LevelSelector";
import ExplanationPanel from "../components/piece/ExplanationPanel";
import YouTubePlayer from "../components/player/YouTubePlayer";
import VerovioScoreViewer from "../components/score/VerovioScoreViewer";
import AnchorAuthoringModal from "../components/sync/AnchorAuthoringModal";
import TimestampImportModal from "../components/sync/TimestampImportModal";
import CommentsSection from "../components/piece/CommentsSection";
import { useYouTubePlayer } from "../hooks/useYouTubePlayer";
import { useLevel, trackForLevel } from "../context/LevelContext";
import {
  getPiece,
  toggleSave,
  getSyncPoints,
  getAnnotations,
  getScoreXml,
} from "../services/pieces.service";
import {
  interpolateScorePosition,
  findActiveAnnotation,
} from "../services/clientSyncEngine";
import type { Piece, Recording, SyncPoint, Annotation } from "../types";

export default function PieceDetail() {
  const { id } = useParams<{ id: string }>();
  const { level } = useLevel();

  const [piece, setPiece] = useState<Piece | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Cached synchronization data for the active recording
  const [syncPoints, setSyncPoints] = useState<SyncPoint[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [scoreXml, setScoreXml] = useState<string | null>(null);

  // Authoring modal state
  const [isAuthoringOpen, setIsAuthoringOpen] = useState<boolean>(false);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);

  // Player hook
  const {
    containerRef,
    currentTimeSec,
    durationSec,
    isReady,
    isPlaying,
    playerState,
    errorMessage,
    seekTo,
  } = useYouTubePlayer(recording?.youtubeVideoId);

  // 1. Initial piece load
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPiece(id)
      .then((data) => {
        setPiece(data);
        setSaved(Boolean(data.savedByCurrentUser));
        const rec = data.recordings?.[0] || null;
        setRecording(rec);

        // Fetch score XML if available
        if (data.scores?.[0]?.id) {
          getScoreXml(data.scores[0].id)
            .then((xml) => setScoreXml(xml))
            .catch(() => setScoreXml(null));
        }
      })
      .catch((err) => console.error("Error loading piece:", err))
      .finally(() => setLoading(false));
  }, [id]);

  // 2. Fetch & cache sync points + annotations when recording changes
  useEffect(() => {
    if (!recording) return;

    // Load sync points
    getSyncPoints(recording.id)
      .then((pts) => setSyncPoints(pts))
      .catch(() => setSyncPoints([]));

    // Load all annotations for this recording
    getAnnotations(recording.id)
      .then((anns) => setAnnotations(anns))
      .catch(() => setAnnotations([]));
  }, [recording?.id]);

  // 3. Low-latency client-side synchronization calculation
  const track = trackForLevel(level);

  const { activeMeasureNumber } = useMemo(() => {
    const res = interpolateScorePosition(syncPoints, currentTimeSec);
    return {
      activeMeasureNumber: res.measureNumber,
      continuousScorePosition: res.continuousScorePosition,
    };
  }, [syncPoints, currentTimeSec]);

  const activeAnnotation = useMemo(() => {
    return findActiveAnnotation(
      annotations,
      activeMeasureNumber,
      currentTimeSec,
      track
    );
  }, [annotations, activeMeasureNumber, currentTimeSec, track]);

  async function handleSave() {
    if (!id) return;
    await toggleSave(id, saved);
    setSaved((s) => !s);
  }

  // Measure click in score seeks playback
  function handleScoreMeasureClick(measureNum: number) {
    const pt = syncPoints.find((p) => p.measureNumber === measureNum);
    if (pt) {
      seekTo(pt.timestampSec);
    } else {
      // Find bounding anchors and estimate timestamp
      const sorted = [...syncPoints].sort((a, b) => a.measureNumber - b.measureNumber);
      for (let i = 0; i < sorted.length - 1; i++) {
        if (measureNum >= sorted[i].measureNumber && measureNum <= sorted[i + 1].measureNumber) {
          const ratio =
            (measureNum - sorted[i].measureNumber) /
            (sorted[i + 1].measureNumber - sorted[i].measureNumber);
          const estimatedSec =
            sorted[i].timestampSec +
            ratio * (sorted[i + 1].timestampSec - sorted[i].timestampSec);
          seekTo(estimatedSec);
          return;
        }
      }
    }
  }

  if (loading || !piece || !id) {
    return (
      <div className="min-h-screen bg-cream">
        <Navbar />
        <div className="flex items-center justify-center p-20 text-espresso font-body">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-tan border-t-transparent rounded-full animate-spin" />
            <p>Loading composition and score…</p>
          </div>
        </div>
      </div>
    );
  }

  const primaryScore = piece.scores?.[0];

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="px-6 sm:px-8 pb-16 max-w-[1200px] mx-auto">
        {/* Title & Metadata Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 mb-4">
          <div>
            <h1 className="font-display font-bold text-3xl text-espresso">
              {piece.title}
            </h1>
            <p className="font-body text-espresso/70 mt-1">
              {piece.composer} {piece.year && `· ${piece.year}`}
              {recording && ` · ${recording.performer}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <LevelSelector pieceId={id} />

            <button
              onClick={handleSave}
              className={`font-display font-semibold text-xs rounded-pill px-5 py-2.5 border-2 transition shrink-0 ${
                saved
                  ? "bg-espresso text-white border-espresso"
                  : "border-espresso text-espresso hover:bg-espresso hover:text-white"
              }`}
            >
              {saved ? "Saved in Library" : "Save Piece"}
            </button>
          </div>
        </div>

        {/* Performance Selector & Comparison Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white/70 backdrop-blur rounded-[12px] p-3 mb-6 border border-espresso/10">
          <div className="flex items-center gap-2">
            <span className="font-display text-xs font-semibold text-espresso">Recording:</span>
            {piece.recordings && piece.recordings.length > 1 ? (
              <select
                value={recording?.id || ""}
                onChange={(e) => {
                  const sel = piece.recordings?.find((r) => r.id === e.target.value);
                  if (sel) setRecording(sel);
                }}
                className="bg-cream border border-espresso/20 rounded-pill px-3 py-1 font-body text-xs text-espresso focus:outline-none"
              >
                {piece.recordings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.performer} {r.year ? `(${r.year})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-body text-xs text-espresso/80">
                {recording?.performer || "Default performance"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAuthoringOpen(true)}
              className="text-xs font-display font-medium text-tan hover:text-espresso transition flex items-center gap-1"
            >
              ⚙ Anchor Calibration ({syncPoints.length})
            </button>
            {recording && (
              <button
                onClick={() => setIsImportOpen(true)}
                className="text-xs font-display font-medium text-espresso/70 hover:text-espresso transition"
              >
                Import Analysis
              </button>
            )}

            {piece.recordings && piece.recordings.length >= 2 && (
              <Link
                to={`/pieces/${id}/compare`}
                className="text-xs font-display font-semibold bg-tan text-white px-3.5 py-1.5 rounded-pill hover:bg-espresso transition shadow-sm"
              >
                Compare Performances →
              </Link>
            )}
          </div>
        </div>

        {/* Dual Multimedia Workspace: Player + Score */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
          {/* YouTube Video Player Column */}
          <div className="lg:col-span-6 flex flex-col gap-3">
            <YouTubePlayer
              containerRef={containerRef}
              isReady={isReady}
              isPlaying={isPlaying}
              playerState={playerState}
              errorMessage={errorMessage}
              currentTimeSec={currentTimeSec}
              durationSec={durationSec}
              onSeek={seekTo}
            />

            <div className="flex items-center justify-between text-xs font-body text-espresso/60 px-1">
              <span>Status: {isReady ? (isPlaying ? "Synchronized (Playing)" : "Paused") : "Connecting…"}</span>
              <span>
                {activeMeasureNumber ? `Tracking Bar ${activeMeasureNumber}` : "Position unanchored"}
              </span>
            </div>
          </div>

          {/* Interactive Verovio Score Viewer Column */}
          <div className="lg:col-span-6">
            <VerovioScoreViewer
              xmlContent={scoreXml}
              musicXmlUrl={primaryScore ? `/api/scores/${primaryScore.id}/xml` : null}
              activeMeasureNumber={activeMeasureNumber}
              onMeasureClick={handleScoreMeasureClick}
              className="h-full min-h-[350px]"
            />
          </div>
        </div>

        {/* Tiered Synchronized Explanations */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-xl text-espresso">
              Synchronized Analysis
            </h2>
          </div>

          <ExplanationPanel
            text={activeAnnotation?.text ?? null}
            section={activeAnnotation?.section ?? null}
            subsection={activeAnnotation?.subsection ?? null}
            activeMeasure={activeMeasureNumber}
            currentTimeSec={currentTimeSec}
          />
        </div>

        {/* Contextual Discussion & Comments */}
        <CommentsSection
          pieceId={id}
          recordingId={recording?.id}
          currentTimeSec={currentTimeSec}
          currentMeasure={activeMeasureNumber}
          onSeek={seekTo}
        />

        {/* Authoring Modal */}
        {recording && primaryScore && (
          <AnchorAuthoringModal
            recordingId={recording.id}
            scoreId={primaryScore.id}
            currentTimeSec={currentTimeSec}
            initialMeasure={activeMeasureNumber}
            syncPoints={syncPoints}
            isOpen={isAuthoringOpen}
            onClose={() => setIsAuthoringOpen(false)}
            onSyncPointsUpdated={(pts) => setSyncPoints(pts)}
            onSeek={seekTo}
          />
        )}
        {recording && (
          <TimestampImportModal
            recordingId={recording.id}
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
          />
        )}
      </main>
    </div>
  );
}
