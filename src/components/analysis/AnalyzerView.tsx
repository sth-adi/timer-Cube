"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useFullSolve } from "@/hooks/useFullSolve";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { formatTime, parseTimeInput } from "@/lib/utils/time";
import { SolveReplay } from "./SolveReplay";
import { PhaseBreakdownCards } from "./PhaseBreakdown";
import { FindingsList } from "./FindingsList";
import { cn } from "@/lib/utils/cn";
import { AnalyzerEmptyState, AnalyzerResultSkeleton } from "./AnalyzerSkeleton";

export function AnalyzerView() {
  const { scramble, reconstruction, result, errors, loading, solveId, moveTimestamps, timeMs, setScramble, setReconstruction, setTimeMs, run } =
    useAnalysisStore();
  const saveReconstruction = useSessionStore((s) => s.saveReconstruction);
  const solves = useSessionStore((s) => s.solves);
  const savedOnSolve = solveId ? solves.find((s) => s.id === solveId)?.reconstruction : undefined;
  const isSaved = solveId !== null && savedOnSolve === reconstruction && reconstruction.trim() !== "";
  const currentScramble = useScrambleStore((s) => s.scramble);
  // The analysed solve's stored row has the gyro stream the replay's Gyro Twin follows — used only while the
  // reconstruction on screen is still the one that was recorded.
  const analysedSolve = useSessionStore((s) => (solveId ? s.allSolves.find((x) => x.id === solveId) : undefined));
  const fullAnalysed = useFullSolve(result?.ok ? (analysedSolve ?? null) : null);
  const sameMoves = (a: string, b: string) => a.trim().split(/\s+/).join(" ") === b.trim().split(/\s+/).join(" ");
  const gyroStream = fullAnalysed.solve && sameMoves(fullAnalysed.solve.reconstruction ?? "", reconstruction) ? fullAnalysed.solve.gyroStream : null;
  const [timeText, setTimeText] = useState(() => {
    const ms = useAnalysisStore.getState().timeMs;
    return ms === null ? "" : formatTime(ms);
  });
  const reconRef = useRef<HTMLTextAreaElement>(null);

  // When a solve is sent over from the solve list it arrives with its scramble
  // and time already attached, so fill the time in and put the cursor straight
  // into the one box the cuber still has to fill.
  useEffect(
    () =>
      useAnalysisStore.subscribe((state, prev) => {
        if (state.requestSeq === prev.requestSeq) return;
        setTimeText(state.timeMs === null ? "" : formatTime(state.timeMs));
        reconRef.current?.focus();
      }),
    [],
  );

  const onSave = () => {
    if (!solveId) return;
    void saveReconstruction(solveId, reconstruction);
  };

  const commitTime = (text: string) => {
    const parsed = text.trim() ? parseTimeInput(text) : null;
    setTimeMs(parsed);
  };

  const phases = result?.phases ?? [];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 pb-4">
      <div className="card rounded-xl p-3">
        <h2 className="mb-2 text-base font-semibold text-foreground">Solve analyzer</h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Type the moves you actually made. The analyzer replays them on a virtual cube, works out where each
          phase started and ended, then solves every phase again from the position you were in, so you can see
          exactly where the moves went.
        </p>

        <label className="mb-1 block text-[11px] font-medium text-muted-2">Scramble</label>
        <div className="mb-3 flex gap-2">
          <input
            value={scramble}
            onChange={(e) => setScramble(e.target.value)}
            placeholder="R U R' U' F2 L…"
            className="min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-2.5 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => setScramble(currentScramble)}
            disabled={!currentScramble}
            className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium text-muted hover:bg-bg-panel-2 hover:text-foreground disabled:opacity-40"
          >
            Use current
          </button>
        </div>

        <label className="mb-1 block text-[11px] font-medium text-muted-2">
          Your solution
        </label>
        <textarea
          ref={reconRef}
          value={reconstruction}
          onChange={(e) => setReconstruction(e.target.value)}
          rows={4}
          placeholder="y' D R' D2 F R2 U' R U R' …"
          className="mb-1 w-full resize-y rounded-lg bg-bg-panel-2 px-2.5 py-2 font-mono text-xs leading-relaxed outline-none focus:ring-1 focus:ring-accent"
        />
        <p className="mb-3 text-[11px] leading-relaxed text-muted-2">
          Wide moves as <span className="font-mono">Rw</span> or <span className="font-mono">r</span>, rotations as{" "}
          <span className="font-mono">x y z</span>, slices as <span className="font-mono">M E S</span>. Brackets
          and <span className="font-mono">{"//"}</span> comments are ignored.
        </p>

        <div className="flex items-end gap-2">
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-medium text-muted-2">
              Time (optional)
            </label>
            <input
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              onBlur={(e) => commitTime(e.target.value)}
              placeholder="14.82"
              inputMode="decimal"
              className="w-24 rounded-lg bg-bg-panel-2 px-2.5 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              commitTime(timeText);
              void run();
            }}
            disabled={loading || !scramble.trim() || !reconstruction.trim()}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-fg transition-opacity disabled:opacity-40"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="animate-fade-in-up border-t border-danger/40 pt-3">
          <p className="mb-1 text-sm font-semibold text-danger">Couldn&apos;t analyze this solve</p>
          <ul className="space-y-1 text-xs leading-relaxed text-muted">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {loading && !result && <AnalyzerResultSkeleton />}
      {!loading && !result && errors.length === 0 && <AnalyzerEmptyState />}

      {result && (
        <>
          <div className="card animate-fade-in-up rounded-xl p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-medium leading-relaxed text-foreground">{result.summary}</p>
              {solveId && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSaved}
                  className={cn(
                    "hit-y flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                    isSaved ? "text-success" : "bg-bg-panel-2 text-muted hover:text-accent",
                  )}
                >
                  {isSaved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                  {isSaved ? "Saved" : "Save to solve"}
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-2.5 text-[11px] tabular-nums text-muted">
              <span className="flex items-center gap-1">
                Cross on <span className="text-foreground">{result.crossFace}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-foreground">{result.metrics.stm}</span> STM ·{" "}
                <span className="text-foreground">{result.metrics.qtm}</span> QTM ·{" "}
                <span className="text-foreground">{result.metrics.rotations}</span> rotations
              </span>
              {result.tps !== undefined && (
                <span className="flex items-center gap-1">
                  <span className="text-foreground">{result.tps.toFixed(1)}</span> TPS
                </span>
              )}
            </div>
          </div>

          <FindingsList findings={result.findings} />

          {phases.length > 0 && (
            <SolveReplay
              scramble={result.scramble}
              phases={phases}
              moves={result.moves}
              findings={result.findings}
              summary={result.summary}
              moveTimestamps={moveTimestamps ?? undefined}
              totalMs={timeMs ?? undefined}
              gyroStream={gyroStream}
              ghostOf={solveId ? { id: solveId, date: analysedSolve?.date, event: analysedSolve?.event } : undefined}
            />
          )}

          <PhaseBreakdownCards phases={phases} />
        </>
      )}
    </div>
  );
}
