"use client";

import type { PhaseAnalysis } from "@/lib/analysis/analyze";
import { cn } from "@/lib/utils/cn";

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
      <div className="card animate-fade-in-up rounded-xl p-3">
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-2">Where the moves went</h3>
        <div className="space-y-1.5">
          {phases.map((p) => (
            <PhaseBar key={`${p.label}-${p.slot ?? ""}`} phase={p} max={maxStm} />
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-2">
          Green is what the phase needed from the position you were in; amber is what it cost on top. A grey bar
          means the search couldn&apos;t find a reference for that phase, so there&apos;s nothing to compare against
          — not that it was efficient.
        </p>
      </div>

      <div className="card animate-fade-in-up rounded-xl p-3">
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-2">Phase by phase</h3>
        <div className="space-y-2">
          {phases.map((p) => (
            <PhaseDetail key={`${p.label}-${p.slot ?? ""}-detail`} phase={p} />
          ))}
        </div>
      </div>
    </>
  );
}
