"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Gauge, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface TimedCubePlayerProps {
  /** The alg that plays on the player's own timeline. */
  alg: string;
  /** Moves applied silently to establish the starting position before `alg` plays. */
  setupAlg?: string;
  /**
   * Real (or fallback) elapsed ms for each move in `alg`, one entry per move,
   * in order. Authored onto the player's own timeline (see below) rather than
   * driving playback ourselves, so play/pause/scrub still work through the
   * player's own real API — they just pace against how long each move
   * actually took.
   */
  gapsMs: number[];
  /** Whether `gapsMs` is real capture timing (vs. a level fallback pace) — only changes the badge text below the controls. */
  hasRealTiming: boolean;
  /** Applied to the cube viewport itself, not the controls beneath it. */
  className?: string;
}

const SPEEDS = [0.5, 1, 2, 4] as const;
/** Fixed visual duration for a single turn's animation — only the *pause* before each move varies with the real gap. */
const TURN_MS = 150;
/** How often to read the player's own timeline position while playing, to keep the scrubber in sync. */
const POLL_MS = 80;

/**
 * A 3D cube whose playback timeline is authored move-by-move from real
 * capture data, using cubing.js's own `animationTimelineLeavesRequest` API —
 * the same mechanism the library's own docs use for custom per-move timing.
 * Play/pause/scrub are driven through the player's real public API
 * (`play()`, `pause()`, the `timestamp` setter), not simulated by swapping
 * `alg` in and out — that doesn't animate anything on its own.
 */
export function TimedCubePlayer({ alg, setupAlg, gapsMs, hasRealTiming, className }: TimedCubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    (async () => {
      const [{ TwistyPlayer }, { Alg }] = await Promise.all([import("cubing/twisty"), import("cubing/alg")]);
      if (cancelled || !container) return;

      const player = new TwistyPlayer({
        puzzle: "3x3x3",
        experimentalSetupAlg: setupAlg,
        background: "none",
        controlPanel: "none",
        hintFacelets: "none",
        experimentalDragInput: "auto",
      });
      player.style.width = "100%";
      player.style.height = "100%";
      container.appendChild(player);
      playerRef.current = player;

      // Assigned after mount (mirrors cubing.js's own documented pattern for
      // animationTimelineLeavesRequest) so the leaves below are guaranteed to
      // describe the exact alg the player just parsed.
      player.alg = alg;

      const leafMoves = [...Alg.fromString(alg).experimentalLeafMoves()];
      let duration = 0;
      if (leafMoves.length > 0 && leafMoves.length === gapsMs.length) {
        let end = 0;
        const leaves = leafMoves.map((move, i) => {
          const gap = Math.max(0, gapsMs[i]);
          const start = end + Math.max(0, gap - TURN_MS);
          end = start + TURN_MS;
          return { animLeaf: move, start, end };
        });
        duration = end;
        // `MillisecondTimestamp` is a branded number type cubing.js doesn't
        // export, so a plain number literal can't satisfy it structurally —
        // cast at this one boundary rather than fighting the brand.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        player.experimentalModel.animationTimelineLeavesRequest.set(leaves as any);
      }
      if (!cancelled) {
        setDurationMs(duration);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (playerRef.current && container?.contains(playerRef.current)) {
        container.removeChild(playerRef.current);
      }
      playerRef.current = null;
    };
    // alg/setupAlg/gapsMs are only meaningful together at construction time —
    // the parent remounts this component (via a `key`) on phase change
    // rather than asking it to re-author a live player's timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (playerRef.current) playerRef.current.tempoScale = speed;
  }, [speed]);

  // Polls the player's own timeline position while playing, so the scrubber
  // tracks native playback instead of a second clock of our own that could
  // drift from it. Self-rescheduling (like the rest of this codebase's
  // timers) — setState only ever happens inside the async tick, never
  // synchronously during the effect itself.
  useEffect(() => {
    if (!playing) return undefined;
    let cancelled = false;
    let timer: number;
    const tick = async () => {
      const t: unknown = await playerRef.current?.experimentalGet.timestamp();
      if (cancelled) return;
      if (typeof t === "number") {
        setPositionMs(t);
        if (durationMs > 0 && t >= durationMs - 1) {
          setPlaying(false);
          return;
        }
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [playing, durationMs]);

  const atEnd = durationMs > 0 && positionMs >= durationMs - 1;

  const onPlayPause = () => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      player.pause();
      setPlaying(false);
      return;
    }
    if (atEnd) {
      player.timestamp = 0;
      setPositionMs(0);
    }
    player.play();
    setPlaying(true);
  };

  const onScrub = (value: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.pause();
    player.timestamp = value;
    setPlaying(false);
    setPositionMs(value);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div ref={containerRef} className={className} />

      {ready && durationMs > 0 && (
        <div className="flex w-full flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPlayPause}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {atEnd ? "Replay" : playing ? "Pause" : "Play"}
            </button>
            <div className="flex items-center gap-1 rounded-full bg-bg-panel-2 p-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={cn(
                    "rounded-full px-2 py-1 text-[10px] font-medium tabular-nums transition-colors",
                    speed === s ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={durationMs}
            step={1}
            value={Math.min(positionMs, durationMs)}
            onChange={(e) => onScrub(Number(e.target.value))}
            className="w-full max-w-[16rem] accent-accent"
            aria-label="Scrub through the moves"
          />
          <p className="flex items-center gap-1 text-[10px] text-muted-2">
            {hasRealTiming ? (
              <>
                <Clock size={11} className="text-accent" /> Timed exactly as solved
              </>
            ) : (
              <>
                <Gauge size={11} /> Estimated pacing — no capture timing for this solve
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
