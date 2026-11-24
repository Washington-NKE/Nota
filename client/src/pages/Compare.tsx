import { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import YouTubePlayer from "../components/player/YouTubePlayer";
import VerovioScoreViewer from "../components/score/VerovioScoreViewer";
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

export default function Compare() {
  const { id } = useParams<{ id: string }>();
  const { level } = useLevel();
  const track = trackForLevel(level);

  const [piece, setPiece] = useState<Piece | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [scoreXml, setScoreXml] = useState<string | null>(null);

  // Selected recordings
  const [recA, setRecA] = useState<Recording | null>(null);
  const [recB, setRecB] = useState<Recording | null>(null);

  // Independent synchronization maps
  const [syncPointsA, setSyncPointsA] = useState<SyncPoint[]>([]);
  const [syncPointsB, setSyncPointsB] = useState<SyncPoint[]>([]);

  // Independent annotations
  const [annotationsA, setAnnotationsA] = useState<Annotation[]>([]);
  const [annotationsB, setAnnotationsB] = useState<Annotation[]>([]);

  // Player hooks for both recordings
  const playerA = useYouTubePlayer(recA?.youtubeVideoId);
  const playerB = useYouTubePlayer(recB?.youtubeVideoId);

  // Load piece, recordings and score
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPiece(id)
      .then((data) => {
        setPiece(data);
        setSaved(Boolean(data.savedByCurrentUser));
        const recordings = data.recordings || [];
        if (recordings.length >= 1) setRecA(recordings[0]);
        if (recordings.length >= 2) setRecB(recordings[1]);

        if (data.scores?.[0]?.id) {
          getScoreXml(data.scores[0].id)
            .then((xml) => setScoreXml(xml))
            .catch(() => setScoreXml(null));
        }
      })
      .catch((err) => console.error("Error loading comparison data:", err))
      .finally(() => setLoading(false));
  }, [id]);

  // Load sync points & annotations for Recording A
  useEffect(() => {
    if (!recA) return;
    getSyncPoints(recA.id).then(setSyncPointsA).catch(() => setSyncPointsA([]));
    getAnnotations(recA.id).then(setAnnotationsA).catch(() => setAnnotationsA([]));
  }, [recA?.id]);

  // Load sync points & annotations for Recording B
  useEffect(() => {
    if (!recB) return;
    getSyncPoints(recB.id).then(setSyncPointsB).catch(() => setSyncPointsB([]));
    getAnnotations(recB.id).then(setAnnotationsB).catch(() => setAnnotationsB([]));
  }, [recB?.id]);

  // Interpolation for Recording A
  const interpA = useMemo(() => {
    return interpolateScorePosition(syncPointsA, playerA.currentTimeSec);
  }, [syncPointsA, playerA.currentTimeSec]);

  // Interpolation for Recording B
  const interpB = useMemo(() => {
    return interpolateScorePosition(syncPointsB, playerB.currentTimeSec);
  }, [syncPointsB, playerB.currentTimeSec]);

  // Active annotations
  const activeAnnA = useMemo(() => {
    return findActiveAnnotation(annotationsA, interpA.measureNumber, playerA.currentTimeSec, track);
  }, [annotationsA, interpA.measureNumber, playerA.currentTimeSec, track]);

  const activeAnnB = useMemo(() => {
    return findActiveAnnotation(annotationsB, interpB.measureNumber, playerB.currentTimeSec, track);
  }, [annotationsB, interpB.measureNumber, playerB.currentTimeSec, track]);

  async function handleSave() {
    if (!id) return;
    await toggleSave(id, saved);
    setSaved((s) => !s);
  }

  // Common measure reference: prioritize the currently playing player
  const commonActiveMeasure = playerB.isPlaying
    ? interpB.measureNumber
    : interpA.measureNumber;

  if (loading || !piece || !id) {
    return (
      <div className="min-h-screen bg-cream">
        <Navbar />
        <div className="flex items-center justify-center p-20 text-espresso font-body">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-tan border-t-transparent rounded-full animate-spin" />
            <p>Loading multi-performance comparison…</p>
          </div>
        </div>
      </div>
    );
  }

  const recordings = piece.recordings ?? [];

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="px-6 sm:px-8 pb-16 max-w-[1250px] mx-auto">
        {/* Navigation & Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 mb-4">
          <div>
            <h1 className="font-display font-bold text-3xl text-espresso">
              {piece.title}
            </h1>
            <p className="font-body text-espresso/70 mt-1">
              Comparative Performance & Interpretation Studio
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={`/pieces/${id}`}
              className="font-display font-semibold text-xs text-espresso bg-white border border-espresso/20 rounded-pill px-4 py-2 hover:bg-espresso hover:text-white transition"
            >
              ← Back to Listening View
            </Link>
            <button
              onClick={handleSave}
              className="font-display font-semibold text-xs rounded-pill px-5 py-2 border-2 border-espresso text-espresso hover:bg-espresso hover:text-white transition"
            >
              {saved ? "Saved" : "Save Piece"}
            </button>
          </div>
        </div>

        {recordings.length < 2 ? (
          <div className="card-surface p-12 text-center text-espresso/70 mt-8">
            <p className="font-display font-semibold text-lg mb-2">
              Additional performance needed
            </p>
            <p className="font-body text-sm max-w-md mx-auto">
              This piece requires at least two registered recordings for side-by-side comparison.
              Currently only {recordings.length} recording is available.
            </p>
          </div>
        ) : (
          <>
            {/* Side-by-Side Dual Performance Players */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 mb-6">
              {/* Recording 1 Column */}
              <div className="card-surface p-4 border border-espresso/10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-bold text-sm text-espresso">
                      Interpretation A
                    </span>
                    {recordings.length > 2 && (
                      <select
                        value={recA?.id || ""}
                        onChange={(e) => {
                          const found = recordings.find((r) => r.id === e.target.value);
                          if (found) setRecA(found);
                        }}
                        className="bg-cream border border-espresso/20 rounded-pill px-2.5 py-0.5 text-xs text-espresso font-body"
                      >
                        {recordings.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.performer}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <p className="font-body text-xs text-espresso/70 mb-3 truncate">
                    {recA?.performer}
                  </p>

                  <YouTubePlayer
                    containerRef={playerA.containerRef}
                    isReady={playerA.isReady}
                    isPlaying={playerA.isPlaying}
                    errorMessage={playerA.errorMessage}
                    currentTimeSec={playerA.currentTimeSec}
                    durationSec={playerA.durationSec}
                    onSeek={playerA.seekTo}
                  />

                  {/* Synchronized Measure & Tempo stats */}
                  <div className="mt-3 p-3 bg-cream/70 rounded-lg flex items-center justify-between text-xs font-body">
                    <span className="font-semibold text-espresso">
                      {interpA.measureNumber ? `Measure ${interpA.measureNumber}` : "Intro / Unanchored"}
                    </span>
                    <span className="text-espresso/60">
                      {syncPointsA.length} verified anchors
                    </span>
                  </div>

                  {/* Active Analysis */}
                  <div className="mt-2.5 p-3 bg-white rounded-lg border border-espresso/10 min-h-[70px]">
                    <p className="font-body text-xs text-espresso/90 italic">
                      {activeAnnA?.text || "Synchronized commentary will appear here during playback."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recording 2 Column */}
              <div className="card-surface p-4 border border-espresso/10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-bold text-sm text-espresso">
                      Interpretation B
                    </span>
                    {recordings.length > 2 && (
                      <select
                        value={recB?.id || ""}
                        onChange={(e) => {
                          const found = recordings.find((r) => r.id === e.target.value);
                          if (found) setRecB(found);
                        }}
                        className="bg-cream border border-espresso/20 rounded-pill px-2.5 py-0.5 text-xs text-espresso font-body"
                      >
                        {recordings.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.performer}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <p className="font-body text-xs text-espresso/70 mb-3 truncate">
                    {recB?.performer}
                  </p>

                  <YouTubePlayer
                    containerRef={playerB.containerRef}
                    isReady={playerB.isReady}
                    isPlaying={playerB.isPlaying}
                    errorMessage={playerB.errorMessage}
                    currentTimeSec={playerB.currentTimeSec}
                    durationSec={playerB.durationSec}
                    onSeek={playerB.seekTo}
                  />

                  {/* Synchronized Measure & Tempo stats */}
                  <div className="mt-3 p-3 bg-cream/70 rounded-lg flex items-center justify-between text-xs font-body">
                    <span className="font-semibold text-espresso">
                      {interpB.measureNumber ? `Measure ${interpB.measureNumber}` : "Intro / Unanchored"}
                    </span>
                    <span className="text-espresso/60">
                      {syncPointsB.length} verified anchors
                    </span>
                  </div>

                  {/* Active Analysis */}
                  <div className="mt-2.5 p-3 bg-white rounded-lg border border-espresso/10 min-h-[70px]">
                    <p className="font-body text-xs text-espresso/90 italic">
                      {activeAnnB?.text || "Synchronized commentary will appear here during playback."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Common Canonical Score Reference */}
            {scoreXml && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-semibold text-xl text-espresso">
                    Canonical Score Reference
                  </h2>
                  <span className="font-body text-xs text-espresso/60">
                    Both performances map independently to this verified score
                  </span>
                </div>

                <VerovioScoreViewer
                  xmlContent={scoreXml}
                  activeMeasureNumber={commonActiveMeasure}
                  className="max-h-[500px]"
                />
              </div>
            )}

            {/* Discussion & Community */}
            <CommentsSection
              pieceId={id}
              recordingId={recA?.id}
              currentTimeSec={playerA.currentTimeSec}
              currentMeasure={interpA.measureNumber}
            />
          </>
        )}
      </main>
    </div>
  );
}
