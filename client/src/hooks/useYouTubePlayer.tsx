import { useEffect, useRef, useState, useCallback } from "react";

export type YTPlayerState = "unstarted" | "ended" | "playing" | "paused" | "buffering" | "cued";

interface YTPlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: {
        autoplay?: 0 | 1;
        controls?: 0 | 1;
        rel?: 0 | 1;
        modestbranding?: 1;
        origin?: string;
      };
      events: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<YTNamespace> | null = null;
let apiLoadTimeout: ReturnType<typeof setTimeout> | null = null;

function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById("youtube-iframe-api");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (apiLoadTimeout) clearTimeout(apiLoadTimeout);
      prevCallback?.();
      resolve(window.YT as YTNamespace);
    };

    apiLoadTimeout = setTimeout(() => {
      reject(new Error("YouTube IFrame API did not load."));
      apiLoadPromise = null;
    }, 15000);
  });

  return apiLoadPromise;
}

export function useYouTubePlayer(videoId: string | undefined) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playerState, setPlayerState] = useState<YTPlayerState>("unstarted");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, true);
      setCurrentTimeSec(seconds);
    }
  }, []);

  const play = useCallback(() => {
    playerRef.current?.playVideo();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  useEffect(() => {
    if (!videoId || !containerRef.current) return;

    let cancelled = false;
    setIsReady(false);
    setErrorMessage(null);
    setCurrentTimeSec(0);

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !containerRef.current) return;

      // Clean up previous instance before attaching new one
      clearTimer();
      try {
        playerRef.current?.destroy();
      } catch {
        // Ignore destroy error on stale instances
      }

      playerRef.current = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            setIsReady(true);
            const dur = event.target.getDuration();
            setDurationSec(dur || 0);
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const data = event.data;

            if (data === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setPlayerState("playing");

              // Poll playback timestamp with high responsiveness (every 100ms)
              clearTimer();
              pollRef.current = setInterval(() => {
                if (playerRef.current) {
                  try {
                    const t = playerRef.current.getCurrentTime();
                    setCurrentTimeSec(t);
                  } catch {
                    // Ignore transient polling exceptions
                  }
                }
              }, 100);
            } else if (data === YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              setPlayerState("paused");
              clearTimer();
              if (playerRef.current) {
                setCurrentTimeSec(playerRef.current.getCurrentTime());
              }
            } else if (data === YT.PlayerState.ENDED) {
              setIsPlaying(false);
              setPlayerState("ended");
              clearTimer();
            } else if (data === YT.PlayerState.BUFFERING) {
              setPlayerState("buffering");
            }
          },
          onError: (event) => {
            if (cancelled) return;
            const code = event.data;
            let msg = "Video playback error.";
            if (code === 101 || code === 150) {
              msg = "Embedding has been disabled for this video by the copyright owner.";
            } else if (code === 100) {
              msg = "Video not found or has been removed.";
            } else if (code === 2) {
              msg = "Invalid YouTube video ID parameter.";
            }
            setErrorMessage(msg);
            clearTimer();
          },
        },
      });
    }).catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "YouTube IFrame API could not be loaded.");
      });

    return () => {
      cancelled = true;
      clearTimer();
      try {
        playerRef.current?.destroy();
      } catch {
        // Ignore cleanup errors
      }
      playerRef.current = null;
      setIsReady(false);
      setIsPlaying(false);
    };
  }, [videoId, clearTimer]);

  return {
    containerRef,
    currentTimeSec,
    durationSec,
    isReady,
    isPlaying,
    playerState,
    errorMessage,
    seekTo,
    play,
    pause,
  };
}
