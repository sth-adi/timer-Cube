"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, CheckCircle2, Clock, Gauge, Info, Lightbulb, Pause, Play } from "lucide-react";
import { findingsForPhase, type Finding, type PhaseAnalysis, type Severity } from "@/lib/analysis/analyze";
import { cn } from "@/lib/utils/cn";

const CubeViewer = dynamic(() => import("@/components/scramble/CubeViewer").then((m) => m.CubeViewer), {
  ssr: false,
});

const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; className: string }> = {
  high: { icon: AlertTriangle, className: "text-danger" },
  medium: { icon: Lightbulb, className: "text-warning" },
  low: { icon: Info, className: "text-muted" },
  good: { icon: CheckCircle2, className: "text-success" },
};

const SPEEDS = [0.5, 1, 2, 4] as const;
/** Per-move pace used when there's no real capture to pace against — close to a relaxed turn cadence. */
const FALLBACK_GAP_MS = 280;
/** Floor on a scheduled step so an instant (or negative, from clock jitter) real gap still reads as a beat, not a freeze-frame. */
const MIN_STEP_MS = 40;

interface SolveReplayProps {
  scramble: string;
  phases: PhaseAnalysis[];
  /** Every move of the solve in order, so "whole solve" can play end to end. */
  moves: string[];
  /** The solve's full findings list, so a phase's commentary can be pulled from it. */
  findings: Finding[];
  /** Best-effort one-line summary shown while "Whole solve" is selected. */
  summary: string;
  /**
   * Elapsed ms from solve start for each entry in `moves`, only present for a
   * solve captured live off a smart cube — real per-move timing, not a
   * retyped reconstruction. When it lines up with `moves` one-for-one, the
   * replay plays back at the cuber's actual pace instead of a level tempo.
   */
  moveTimestamps?: number[];
}

/** A neutral, non-alarming line for a phase that has no specific finding attached. */
function fallbackCaption(phase: PhaseAnalysis): string {
  if (phase.moves.length === 0) return `${phase.label} was skipped — free.`;
  if (phase.model === null) return `${phase.label}: no shorter reference was found to compare against.`;
  if ((phase.lost ?? 0) === 0) return `${phase.label} matched the shortest solution available — clean.`;
  return `${phase.label} cost ${phase.lost} move${phase.lost === 1 ? "" : "s"} more than the shortest available.`;
}

/**
 * Plays the reconstruction back on the 3D cube, one phase at a time, with the
 * analysis for that phase captioned right next to it.
 *
 * Each phase is loaded as its own animation with everything before it applied
 * silently as the setup, so the cube opens exactly as it looked when that phase
 * began — which is the position the analysis is talking about. Watching the
 * expensive pair happen while reading *why* it was expensive is worth more
 * than either the video or the text on its own, which is why they're fused
 * into one panel instead of a replay you scroll past to find the comments.
 *
 * Playback is driven move-by-move by this component, not TwistyPlayer's own
 * built-in player: each move is appended to the player's `alg` on its own
 * schedule (see `gaps` below), so the pauses between moves can match how long
 * the cuber actually took — not a uniform per-move tempo.
 */
export function SolveReplay({ scramble, phases, moves, findings, summary, moveTimestamps }: SolveReplayProps) {
  const [selected, setSelected] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [playedCount, setPlayedCount] = useState(0);

  // -1 is the whole solve; otherwise the index into `phases`.
  const isWhole = selected < 0 || selected >= phases.length;
  const phase = isWhole ? null : phases[selected];

  const movesBefore = isWhole
    ? []
    : moves.slice(0, phases.slice(0, selected).reduce((n, p) => n + p.moves.length, 0));

  const setupAlg = [scramble, ...movesBefore].join(" ").trim();
  const viewMoves = phase ? phase.moves : moves;

  // Selecting a different phase (or "whole solve") restarts the player from
  // its beginning — React's own "reset state when a prop changes" pattern
  // (compare against the previous value during render, not in an effect).
  const [prevSelected, setPrevSelected] = useState(selected);
  if (selected !== prevSelected) {
    setPrevSelected(selected);
    setPlayedCount(0);
    setPlaying(false);
  }

  // Real per-move gaps, sliced to whichever phase is on screen — only used
  // when they line up with `moves` one-for-one, so a stale or hand-edited
  // reconstruction can never pace playback against the wrong moves.
  const { gaps, hasRealTiming } = useMemo(() => {
    if (moveTimestamps && moveTimestamps.length === moves.length) {
      const fullGaps: number[] = [];
      let prev = 0;
      for (const t of moveTimestamps) {
        fullGaps.push(Math.max(0, t - prev));
        prev = t;
      }
      const startIdx = movesBefore.length;
      const slice = fullGaps.slice(startIdx, startIdx + viewMoves.length);
      if (slice.length === viewMoves.length) return { gaps: slice, hasRealTiming: true };
    }
    return { gaps: viewMoves.map(() => FALLBACK_GAP_MS), hasRealTiming: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveTimestamps, moves.length, movesBefore.length, viewMoves.length]);

  const atEnd = playedCount >= viewMoves.length;
  const isPlaying = playing && !atEnd;

  // Self-rescheduling step: each played move re-runs this effect, which
  // schedules the next one at its own real (or fallback) gap. Only ever
  // calls setState from inside the timeout callback, never synchronously
  // during the effect itself, so playback never fights the render it's in.
  useEffect(() => {
    if (!isPlaying) return undefined;
    const gap = gaps[playedCount] ?? FALLBACK_GAP_MS;
    const timer = window.setTimeout(() => setPlayedCount((c) => c + 1), Math.max(MIN_STEP_MS, gap / speed));
    return () => window.clearTimeout(timer);
  }, [isPlaying, playedCount, speed, gaps]);

  const onPlayPause = () => {
    if (atEnd) {
      setPlayedCount(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  const onScrub = (value: number) => {
    setPlaying(false);
    setPlayedCount(value);
  };

  const playedAlg = viewMoves.slice(0, playedCount).join(" ");
  const fullAlg = viewMoves.join(" ");

  // Whole solve: lead with the top (already severity-sorted) findings that
  // aren't about one specific phase, falling back to the summary sentence.
  // One phase: whatever the analysis actually said about it, or a neutral
  // line when nothing stood out — so the caption is never just blank.
  const captions: Finding[] = phase
    ? findingsForPhase(phase, findings)
    : findings.filter((f) => !f.phase).slice(0, 2);

  return (
    <div className="card animate-fade-in-up rounded-xl p-3">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-2">
        <Play size={12} className="text-accent" />
        Watch it back
      </h3>

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelected(-1)}
          aria-pressed={isWhole}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
            isWhole ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
          )}
        >
          Whole solve
        </button>
        {phases.map((p, i) => (
          <button
            key={`${p.label}-${p.slot ?? ""}`}
            type="button"
            onClick={() => setSelected(i)}
            aria-pressed={selected === i}
            disabled={p.moves.length === 0}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-35",
              selected === i ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
            )}
          >
            {p.label}
            {p.slot && <span className="opacity-70"> {p.slot}</span>}
          </button>
        ))}
      </div>

      {/* Keyed so switching phases rebuilds the player rather than leaving it
          paused halfway through the previous phase's timeline. */}
      <div className="mx-auto h-64 w-full max-w-xs">
        <CubeViewer key={selected} alg={playedAlg} setupAlg={setupAlg} controlPanel="none" className="h-full w-full" />
      </div>

      {viewMoves.length > 0 && (
        <div className="mt-2 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPlayPause}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              {atEnd ? "Replay" : isPlaying ? "Pause" : "Play"}
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
            max={viewMoves.length}
            step={1}
            value={playedCount}
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

      <p className="mt-1.5 break-words text-center font-mono text-[11px] leading-relaxed text-muted">
        {fullAlg || "nothing to play"}
      </p>

      {/* The commentary — what this component exists for, not the video. */}
      <div className="mt-3 space-y-2 border-t border-border pt-2.5">
        {captions.length > 0 ? (
          captions.map((f) => {
            const style = SEVERITY_STYLE[f.severity];
            const Icon = style.icon;
            return (
              <div key={f.id} className="flex gap-2">
                <Icon size={13} className={cn("mt-0.5 shrink-0", style.className)} />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-snug">{f.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{f.detail}</p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="flex gap-2 text-[11px] leading-relaxed text-muted">
            <Info size={13} className="mt-0.5 shrink-0 text-muted-2" />
            {phase ? fallbackCaption(phase) : summary}
          </p>
        )}
      </div>
    </div>
  );
}
