"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Play } from "lucide-react";
import type { PhaseAnalysis } from "@/lib/analysis/analyze";
import { cn } from "@/lib/utils/cn";

const CubeViewer = dynamic(() => import("@/components/scramble/CubeViewer").then((m) => m.CubeViewer), {
  ssr: false,
});

interface SolveReplayProps {
  scramble: string;
  phases: PhaseAnalysis[];
  /** Every move of the solve in order, so "whole solve" can play end to end. */
  moves: string[];
}

/**
 * Plays the reconstruction back on the 3D cube, one phase at a time.
 *
 * Each phase is loaded as its own animation with everything before it applied
 * silently as the setup, so the cube opens exactly as it looked when that phase
 * began — which is the position the analysis is talking about. Watching the
 * expensive pair happen is worth more than reading that it cost four moves.
 */
export function SolveReplay({ scramble, phases, moves }: SolveReplayProps) {
  const [selected, setSelected] = useState<number>(-1);

  // -1 is the whole solve; otherwise the index into `phases`.
  const isWhole = selected < 0 || selected >= phases.length;
  const phase = isWhole ? null : phases[selected];

  const movesBefore = isWhole
    ? []
    : moves.slice(0, phases.slice(0, selected).reduce((n, p) => n + p.moves.length, 0));

  const setupAlg = [scramble, ...movesBefore].join(" ").trim();
  const alg = (phase ? phase.moves : moves).join(" ");

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
        <CubeViewer key={selected} alg={alg} setupAlg={setupAlg} controlPanel="bottom-row" className="h-full w-full" />
      </div>

      <p className="mt-1.5 break-words text-center font-mono text-[11px] leading-relaxed text-muted">
        {alg || "nothing to play"}
      </p>
    </div>
  );
}
