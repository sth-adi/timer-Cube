"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bookmark, BookmarkCheck, CheckCircle2, Info, Lightbulb, Loader2, Wand2 } from "lucide-react";
import { useAnalysisStore } from "@/lib/store/analysisStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { formatTime, parseTimeInput } from "@/lib/utils/time";
import type { PhaseAnalysis, Severity } from "@/lib/analysis/analyze";
import { SolveReplay } from "./SolveReplay";
import { cn } from "@/lib/utils/cn";

const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; className: string; label: string }> = {
  high: { icon: AlertTriangle, className: "text-danger", label: "Biggest loss" },
  medium: { icon: Lightbulb, className: "text-warning", label: "Worth fixing" },
  low: { icon: Info, className: "text-muted", label: "Note" },
  good: { icon: CheckCircle2, className: "text-success", label: "Well done" },
};

const pct = (value: number, max: number) => (max > 0 ? (value / max) * 100 : 0);

/** Bar showing what a phase cost against what it could have cost. */
function PhaseBar({ phase, max }: { phase: PhaseAnalysis; max: number }) {
  const used = phase.metrics.stm;
  const model = phase.model?.metrics.stm ?? null;
  const lost = phase.lost ?? 0;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 truncate text-muted">
        {phase.label}
        {phase.slot && <span className="text-muted-2"> {phase.slot}</span>}
      </span>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-bg-panel-2">
        {/* Two segments, so the wasted moves are a thing you can see rather
            than a gap you have to infer: solid up to what the phase needed,
            hatched warning for everything past it. */}
        <div
          className={cn("absolute inset-y-0 left-0", model === null ? "bg-muted/25" : "bg-success/30")}
          style={{ width: `${pct(model ?? used, max)}%` }}
        />
        {lost > 0 && model !== null && (
          <div
            className="absolute inset-y-0 bg-warning/35"
            style={{ left: `${pct(model, max)}%`, width: `${pct(lost, max)}%` }}
          />
        )}
        <span className="absolute inset-y-0 left-1.5 flex items-center font-medium tabular-nums text-foreground/80">
          {used}
        </span>
      </div>
      <span className="w-14 shrink-0 text-right tabular-nums">
        {model === null ? (
          <span className="text-muted-2">—</span>
        ) : lost > 0 ? (
          <span className="text-warning">+{lost}</span>
        ) : (
          <span className="text-success">best</span>
        )}
      </span>
    </div>
  );
}

function PhaseDetail({ phase }: { phase: PhaseAnalysis }) {
  return (
    <div className="rounded-lg bg-bg-panel-2 p-2.5 text-xs">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {phase.label}
          {phase.slot && <span className="text-muted"> · {phase.slot}</span>}
        </span>
        {phase.caseName && <span className="text-accent">{phase.caseName}</span>}
      </div>
      <p className="break-words font-mono text-[11px] leading-relaxed text-foreground/80">
        {phase.moves.length ? phase.moves.join(" ") : <span className="text-muted-2">no moves — skipped</span>}
      </p>
      {phase.model && (phase.lost ?? 0) > 0 && (
        <p className="mt-1.5 break-words font-mono text-[11px] leading-relaxed text-success/80">
          {phase.model.moves.join(" ")}
        </p>
      )}
      {phase.caseAlg && (
        <p className="mt-1.5 break-words text-[11px] leading-relaxed text-muted">
          Standard algorithm: <span className="font-mono">{phase.caseAlg}</span>
        </p>
      )}
    </div>
  );
}

export function AnalyzerView() {
  const { scramble, reconstruction, result, errors, loading, solveId, moveTimestamps, setScramble, setReconstruction, setTimeMs, run } =
    useAnalysisStore();
  const saveReconstruction = useSessionStore((s) => s.saveReconstruction);
  const solves = useSessionStore((s) => s.solves);
  const savedOnSolve = solveId ? solves.find((s) => s.id === solveId)?.reconstruction : undefined;
  const isSaved = solveId !== null && savedOnSolve === reconstruction && reconstruction.trim() !== "";
  const currentScramble = useScrambleStore((s) => s.scramble);
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
  const maxStm = phases.reduce((m, p) => Math.max(m, p.metrics.stm, p.model?.metrics.stm ?? 0), 1);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 pb-4">
      <div className="card rounded-xl p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Wand2 size={15} className="text-accent" />
          Solve analyzer
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Type the moves you actually made. The analyzer replays them on a virtual cube, works out where each
          phase started and ended, then solves every phase again from the position you were in — so you can see
          exactly where the moves went.
        </p>

        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-2">Scramble</label>
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

        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-2">
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
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-2">
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
        <div className="card animate-fade-in-up rounded-xl border-danger/40 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-danger">
            <AlertTriangle size={13} /> Couldn&apos;t analyze this solve
          </p>
          <ul className="space-y-1 text-xs leading-relaxed text-muted">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <>
          <div className="card animate-fade-in-up rounded-xl p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-relaxed">{result.summary}</p>
              {solveId && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSaved}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    isSaved ? "text-success" : "bg-bg-panel-2 text-muted hover:text-accent",
                  )}
                >
                  {isSaved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                  {isSaved ? "Saved" : "Save to solve"}
                </button>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span>
                Cross on <span className="text-foreground">{result.crossFace}</span>
              </span>
              <span>
                <span className="text-foreground">{result.metrics.stm}</span> STM ·{" "}
                <span className="text-foreground">{result.metrics.qtm}</span> QTM ·{" "}
                <span className="text-foreground">{result.metrics.rotations}</span> rotations
              </span>
              {result.tps !== undefined && (
                <span>
                  <span className="text-foreground">{result.tps.toFixed(1)}</span> TPS
                </span>
              )}
            </div>
          </div>

          <div className="card animate-fade-in-up rounded-xl p-3">
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-2">What to work on</h3>
            <div className="space-y-2.5">
              {result.findings.map((f) => {
                const style = SEVERITY_STYLE[f.severity];
                const Icon = style.icon;
                return (
                  <div key={f.id} className="flex gap-2">
                    <Icon size={14} className={cn("mt-0.5 shrink-0", style.className)} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-snug">{f.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{f.detail}</p>
                    </div>
                  </div>
                );
              })}
              {result.findings.length === 0 && (
                <p className="text-xs text-muted">Nothing stands out — this was a clean solve.</p>
              )}
            </div>
          </div>

          {phases.length > 0 && (
            <SolveReplay
              scramble={result.scramble}
              phases={phases}
              moves={result.moves}
              findings={result.findings}
              summary={result.summary}
              moveTimestamps={moveTimestamps ?? undefined}
            />
          )}

          {phases.length > 0 && (
            <div className="card animate-fade-in-up rounded-xl p-3">
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-2">
                Where the moves went
              </h3>
              <div className="space-y-1.5">
                {phases.map((p) => (
                  <PhaseBar key={`${p.label}-${p.slot ?? ""}`} phase={p} max={maxStm} />
                ))}
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-2">
                Green is what the phase needed from the position you were in; amber is what it cost on top. A grey
                bar means the search couldn&apos;t find a reference for that phase, so there&apos;s nothing to
                compare against — not that it was efficient.
              </p>
            </div>
          )}

          {phases.length > 0 && (
            <div className="card animate-fade-in-up rounded-xl p-3">
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-2">
                Phase by phase
              </h3>
              <div className="space-y-2">
                {phases.map((p) => (
                  <PhaseDetail key={`${p.label}-${p.slot ?? ""}-detail`} phase={p} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
