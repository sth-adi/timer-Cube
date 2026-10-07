"use client";

import type { PhaseAnalysis } from "@/lib/analysis/analyze";
import { cn } from "@/lib/utils/cn";
import { CardTitle } from "@/components/recap/RecapParts";

const pct = (value: number, max: number) => (max > 0 ? (value / max) * 100 : 0);

/** Bar showing what a phase cost against what it could have cost. */
function PhaseBar({ phase, max }: { phase: PhaseAnalysis; max: number }) {
  const used = phase.metrics.stm;
  const model = phase.model?.metrics.stm ?? null;
  const lost = phase.lost ?? 0;

  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-x-2 text-xs sm:grid-cols-[5.5rem_minmax(0,1fr)_3.5rem]">
      <span className="truncate text-muted">
        {phase.label}
        {phase.slot && <span className="text-muted-2"> {phase.slot}</span>}
      </span>
      <div className="relative h-6 overflow-hidden rounded-md bg-bg-elevated">
        {/* Two segments, so the wasted moves are a thing you can see rather
            than a gap you have to infer: solid up to what the phase needed,
            hatched warning for everything past it. */}
        <div
          className={cn("absolute inset-y-0 left-0", model === null ? "bg-muted/25" : "bg-success/35")}
          style={{ width: `${pct(model ?? used, max)}%` }}
        />
        {lost > 0 && model !== null && <div className="rc-hatch absolute inset-y-0 opacity-70" style={{ left: `${pct(model, max)}%`, width: `${pct(lost, max)}%` }} />}
        <span className="rc-num absolute inset-y-0 left-2 flex items-center text-[12px] font-semibold text-foreground">{used}</span>
      </div>
      <span className="rc-num text-right font-medium">
        {model === null ? (
          <span className="text-muted-2">—</span>
        ) : lost > 0 ? (
          <span className="rc-t-slow">+{lost}</span>
        ) : (
          <span className="rc-t-good">best</span>
        )}
      </span>
    </div>
  );
}

function PhaseDetail({ phase }: { phase: PhaseAnalysis }) {
  return (
    <div className="rounded-xl bg-bg-panel-2 p-3 text-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2 leading-4">
        <span className="font-semibold text-foreground">
          {phase.label}
          {phase.slot && <span className="font-normal text-muted"> · {phase.slot}</span>}
        </span>
        {phase.caseName && <span className="min-w-0 truncate rc-t-link">{phase.caseName}</span>}
      </div>
      <p className="break-words font-mono text-[12px] leading-5 text-foreground/90 [overflow-wrap:anywhere]">
        {phase.moves.length ? phase.moves.join(" ") : <span className="font-sans italic text-muted-2">no moves, skipped</span>}
      </p>
      {phase.model && (phase.lost ?? 0) > 0 && (
        <p className="mt-2 break-words font-mono text-[12px] leading-5 rc-t-good [overflow-wrap:anywhere]">
          <span className="font-sans text-[11px] uppercase tracking-wide text-muted-2">Better </span>
          {phase.model.moves.join(" ")}
        </p>
      )}
      {phase.caseAlg && (
        <p className="mt-2 break-words text-[12px] leading-5 text-muted">
          Standard algorithm: <span className="font-mono text-foreground/90">{phase.caseAlg}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The two "where the moves went" / "phase by phase" cards shared by the
 * analyzer and the public solve-share page — both start from the exact same
 * `PhaseAnalysis[]` (either freshly computed or re-derived client-side from
 * a shared solve's scramble/reconstruction), so there's nothing
 * page-specific about how this renders.
 */
export function PhaseBreakdownCards({ phases }: { phases: PhaseAnalysis[] }) {
  if (phases.length === 0) return null;
  const maxStm = phases.reduce((m, p) => Math.max(m, p.metrics.stm, p.model?.metrics.stm ?? 0), 1);

  return (
    <>
      <div className="card animate-fade-in-up rounded-2xl p-3 sm:p-4">
        <CardTitle as="h3">Where the moves went</CardTitle>
        <div className="mt-4 flex flex-col gap-2">
          {phases.map((p) => (
            <PhaseBar key={`${p.label}-${p.slot ?? ""}`} phase={p} max={maxStm} />
          ))}
        </div>
        <p className="rc-note mt-4">
          Green is what the phase needed from the position you were in; the hatched bar and the + number are what it
          cost on top. A grey bar means the search couldn&apos;t find a reference for that phase, so there&apos;s
          nothing to compare against, not that it was efficient.
        </p>
      </div>

      <div className="card animate-fade-in-up rounded-2xl p-3 sm:p-4">
        <CardTitle as="h3">Phase by phase</CardTitle>
        <div className="mt-4 flex flex-col gap-2">
          {phases.map((p) => (
            <PhaseDetail key={`${p.label}-${p.slot ?? ""}-detail`} phase={p} />
          ))}
        </div>
      </div>
    </>
  );
}
