"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, CheckCircle2, Info, Lightbulb, Play } from "lucide-react";
import { findingsForPhase, type Finding, type PhaseAnalysis, type Severity } from "@/lib/analysis/analyze";
import { cn } from "@/lib/utils/cn";

const TimedCubePlayer = dynamic(() => import("./TimedCubePlayer").then((m) => m.TimedCubePlayer), {
  ssr: false,
});

const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; className: string }> = {
  high: { icon: AlertTriangle, className: "text-danger" },
  medium: { icon: Lightbulb, className: "text-warning" },
  low: { icon: Info, className: "text-muted" },
  good: { icon: CheckCircle2, className: "text-success" },
};

/** Per-move pace used when there's no real capture to pace against — close to a relaxed turn cadence. */
const FALLBACK_GAP_MS = 280;

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
 * Playback timing is authored onto the player's own timeline (see
 * TimedCubePlayer) rather than driven by this component move-by-move, so its
 * play/pause/scrub controls pace themselves against how long the cuber
 * really took between moves instead of a uniform per-move tempo.
 */
export function SolveReplay({ scramble, phases, moves, findings, summary, moveTimestamps }: SolveReplayProps) {
  const [selected, setSelected] = useState<number>(-1);

  // -1 is the whole solve; otherwise the index into `phases`.
  const isWhole = selected < 0 || selected >= phases.length;
  const phase = isWhole ? null : phases[selected];

  const movesBefore = isWhole
    ? []
    : moves.slice(0, phases.slice(0, selected).reduce((n, p) => n + p.moves.length, 0));

  const setupAlg = [scramble, ...movesBefore].join(" ").trim();
  const viewMoves = phase ? phase.moves : moves;
  const fullAlg = viewMoves.join(" ");

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

      {/* Keyed so switching phases rebuilds the player (and re-authors its
          timeline) rather than leaving it mid-way through the previous
          phase's. Play/pause/scrub/speed controls live in TimedCubePlayer. */}
      <TimedCubePlayer
        key={selected}
        alg={fullAlg}
        setupAlg={setupAlg}
        gapsMs={gaps}
        hasRealTiming={hasRealTiming}
        className="mx-auto h-64 w-full max-w-xs"
      />

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
