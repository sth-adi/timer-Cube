"use client";

import { useEffect, useMemo, useRef } from "react";
import { Check, Loader2, RefreshCw, Target, X } from "lucide-react";
import { useCrossDrillStore } from "@/lib/store/crossDrillStore";
import { ScrambleNet } from "@/components/scramble/ScrambleNet";
import type { Face } from "@/lib/analysis/frames";
import { cn } from "@/lib/utils/cn";

const GRIPS: { face: Face; label: string; hint: string }[] = [
  { face: "D", label: "Cross on the bottom", hint: "white down — how nearly everyone holds it" },
  { face: "U", label: "Cross on top", hint: "white up, matching the scramble orientation" },
];

export function CrossDrill() {
  const {
    scramble,
    attempt,
    crossFace,
    loading,
    grading,
    errors,
    last,
    history,
    setAttempt,
    setCrossFace,
    newScramble,
    submit,
    reset,
  } = useCrossDrillStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!useCrossDrillStore.getState().scramble) void newScramble();
  }, [newScramble]);

  const score = useMemo(() => {
    const solved = history.filter((h) => h.result.solved);
    const optimal = solved.filter((h) => h.result.optimal);
    const wasted = solved.reduce((n, h) => n + (h.result.moveCount - h.result.optimalCount), 0);
    return {
      attempts: history.length,
      solved: solved.length,
      optimal: optimal.length,
      meanWaste: solved.length ? wasted / solved.length : 0,
    };
  }, [history]);

  const onNext = () => {
    void newScramble();
    inputRef.current?.focus();
  };

  return (
    <div className="flex w-full max-w-xl flex-col gap-3 pb-4">
      <div className="card rounded-xl p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Target size={15} className="text-accent" />
          Cross trainer
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Plan the whole cross before you touch the cube, then type it. You get graded against the provably
          shortest cross for this scramble — the exact one, from a complete lookup table, not an estimate.
        </p>

        <div className="mb-3 flex gap-1.5">
          {GRIPS.map((grip) => (
            <button
              key={grip.face}
              type="button"
              onClick={() => setCrossFace(grip.face)}
              aria-pressed={crossFace === grip.face}
              title={grip.hint}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors",
                crossFace === grip.face
                  ? "bg-accent-soft text-accent"
                  : "bg-bg-panel-2 text-muted hover:text-foreground",
              )}
            >
              {grip.label}
            </button>
          ))}
        </div>

        <p className="tabular-timer mb-3 break-words text-center text-sm font-medium leading-relaxed text-foreground/90">
          {loading && !scramble ? "Generating scramble…" : scramble}
        </p>

        {scramble && (
          <div className="mx-auto mb-3 w-full max-w-[13rem]">
            <ScrambleNet scramble={scramble} className="w-full" />
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (last) onNext();
              else void submit();
            }}
            placeholder="D R' F D2 …"
            className="min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-2.5 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-accent"
          />
          {last ? (
            <button
              type="button"
              onClick={onNext}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg"
            >
              <RefreshCw size={13} /> Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={grading || loading || !scramble}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg disabled:opacity-40"
            >
              {grading && <Loader2 size={13} className="animate-spin" />}
              Check
            </button>
          )}
        </div>

        {errors.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-danger">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      {last && (
        <div className="card animate-fade-in-up rounded-xl p-3">
          {!last.result.solved ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
                <X size={15} /> That doesn&apos;t finish the cross
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Replayed on a virtual cube, those {last.result.moveCount} moves leave at least one cross edge out
                of place. Check the grip setting above if you&apos;re sure — the moves are read as though the cross
                is on {crossFace}.
              </p>
            </>
          ) : last.result.optimal ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
              <Check size={15} /> Optimal — {last.result.moveCount} moves, and nothing shorter exists
            </p>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                <Check size={15} /> Solved in {last.result.moveCount}; {last.result.optimalCount} was available
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {last.result.moveCount - last.result.optimalCount} move
                {last.result.moveCount - last.result.optimalCount === 1 ? "" : "s"} spare. Over a hundred solves
                that&apos;s a lot of turning you never needed to do.
              </p>
            </>
          )}

          <p className="mt-2 break-words text-xs text-muted">
            Shortest: <span className="font-mono text-foreground/90">{last.result.optimalMoves.join(" ") || "already solved"}</span>
          </p>
        </div>
      )}

      {score.attempts > 0 && (
        <div className="card rounded-xl p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-2">This session</h3>
            <button type="button" onClick={reset} className="text-[11px] text-muted hover:text-foreground">
              Reset
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="tabular-timer text-lg font-semibold">
                {score.solved}/{score.attempts}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-2">solved</p>
            </div>
            <div>
              <p className="tabular-timer text-lg font-semibold text-success">{score.optimal}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-2">optimal</p>
            </div>
            <div>
              <p className="tabular-timer text-lg font-semibold text-warning">+{score.meanWaste.toFixed(1)}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-2">avg spare</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
