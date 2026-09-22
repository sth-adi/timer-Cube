"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Timer as TimerIcon, Music, ChevronLeft } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { RhythmGamePlayer } from "@/components/rhythm/RhythmGamePlayer";
import { solveFinalMs, type Solve } from "@/types";
import { formatTime } from "@/lib/utils/time";

/** Solves with a reconstruction are playable — a smart-cube capture (with moveTimestamps) plays back at your real pace; anything else falls back to an estimated level cadence (see rhythmGame.ts). */
function playableSolves(solves: Solve[]): Solve[] {
  return solves.filter((s) => !!s.reconstruction).sort((a, b) => b.date - a.date);
}

function SolvePickerRow({ solve, onPick }: { solve: Solve; onPick: () => void }) {
  const finalMs = solveFinalMs(solve);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2.5 text-left transition-colors hover:bg-bg-panel-2/70"
    >
      <span className="flex flex-col">
        <span className="tabular-timer text-sm font-semibold text-foreground">{finalMs === null ? "DNF" : formatTime(finalMs)}</span>
        <span className="text-[10px] text-muted-2">{new Date(solve.date).toLocaleDateString()}</span>
      </span>
      {solve.moveTimestamps && solve.moveTimestamps.length > 0 && (
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">real timing</span>
      )}
    </button>
  );
}

/**
 * Turns any saved solve with a reconstruction into a playable rhythm-game
 * track — see RhythmGamePlayer / lib/analysis/rhythmGame.ts. A solve
 * captured live off a smart cube plays back with its own real per-move
 * timing; any other solve with a saved reconstruction (e.g. from the
 * Analyzer) still works, just with an estimated level cadence instead.
 */
export default function RhythmPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const candidates = useMemo(() => playableSolves(allSolves), [allSolves]);
  const [selected, setSelected] = useState<Solve | null>(null);

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>

        <div className="flex w-full max-w-md flex-col gap-3 pb-8">
          <div className="flex items-center gap-2 px-1">
            <Music size={16} className="text-accent" />
            <h1 className="text-lg font-semibold text-foreground">Rhythm Game</h1>
          </div>

          {selected ? (
            <div className="card flex flex-col gap-2 rounded-xl p-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex w-fit items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <ChevronLeft size={13} />
                Choose a different solve
              </button>
              <RhythmGamePlayer reconstruction={selected.reconstruction!} moveTimestamps={selected.moveTimestamps} />
            </div>
          ) : candidates.length === 0 ? (
            <div className="card rounded-xl p-6 text-center text-sm text-muted">
              No solves with a saved reconstruction yet — solve on a connected smart cube, or save a reconstruction from the Analyzer, to
              unlock a track.
            </div>
          ) : (
            <div className="card flex flex-col gap-1.5 rounded-xl p-3">
              <p className="px-1 pb-1 text-xs text-muted-2">Pick a solve to play its real turn-by-turn rhythm.</p>
              {candidates.map((solve) => (
                <SolvePickerRow key={solve.id} solve={solve} onPick={() => setSelected(solve)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
