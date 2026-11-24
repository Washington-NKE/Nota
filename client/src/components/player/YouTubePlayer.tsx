import type { RefObject } from "react";
import type { YTPlayerState } from "../../hooks/useYouTubePlayer";

interface YouTubePlayerProps {
  containerRef: RefObject<HTMLDivElement | null>;
  isReady: boolean;
  isPlaying?: boolean;
  playerState?: YTPlayerState;
  errorMessage?: string | null;
  currentTimeSec?: number;
  durationSec?: number;
  onSeek?: (seconds: number) => void;
  className?: string;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function YouTubePlayer({
  containerRef,
  isReady,
  errorMessage,
  currentTimeSec = 0,
  durationSec = 0,
  onSeek,
  className = "",
}: YouTubePlayerProps) {
  return (
    <div className={`relative rounded-[12px] overflow-hidden bg-black aspect-video flex flex-col justify-end shadow-md ${className}`}>
      {/* Actual IFrame target div */}
      <div ref={containerRef} className="w-full h-full absolute inset-0" />

      {/* Loading state */}
      {!isReady && !errorMessage && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 z-10 text-white font-body text-sm pointer-events-none">
          <div className="w-8 h-8 border-3 border-tan border-t-transparent rounded-full animate-spin" />
          <p className="text-white/70">Connecting to YouTube performance…</p>
        </div>
      )}

      {/* Error state */}
      {errorMessage && (
        <div className="absolute inset-0 bg-espresso/90 flex flex-col items-center justify-center p-6 text-center z-10 text-white font-body text-sm">
          <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-300 flex items-center justify-center mb-2 font-bold text-lg">
            !
          </div>
          <p className="font-semibold text-base mb-1">Playback Restricted</p>
          <p className="text-white/70 max-w-md">{errorMessage}</p>
        </div>
      )}

      {/* Synchronized timeline bar overlay at bottom */}
      {isReady && durationSec > 0 && (
        <div className="relative z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6 flex items-center gap-3">
          <span className="font-mono text-xs text-white/90 select-none">
            {formatTime(currentTimeSec)}
          </span>

          <input
            type="range"
            min={0}
            max={durationSec}
            step={0.5}
            value={Math.min(durationSec, currentTimeSec)}
            onChange={(e) => onSeek?.(Number(e.target.value))}
            className="w-full h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer accent-tan hover:bg-white/50 transition"
          />

          <span className="font-mono text-xs text-white/60 select-none">
            {formatTime(durationSec)}
          </span>
        </div>
      )}
    </div>
  );
}
