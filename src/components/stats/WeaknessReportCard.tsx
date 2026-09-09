"use client";

import { useMemo } from "react";
import { Loader2, RefreshCw, TrendingDown } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { candidateSolves, useWeaknessStore } from "@/lib/store/weaknessStore";
import type { WeaknessEntry } from "@/lib/analysis/weaknessReport";

function Row({ entry, max }: { entry: WeaknessEntry; max: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted">{entry.label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
        <div
          className="absolute inset-y-0 left-0 bg-warning/45"
          style={{ width: `${max > 0 ? (entry.totalLost / max) * 100 : 0}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-right tabular-nums text-muted-2">
        +{entry.totalLost} · ×{entry.occurrences}
      </span>
    </div>
  );
}

/**
 * A single analyzed solve tells you about one attempt; this looks across
 * every solve you've saved a reconstruction for and asks the more useful
 * question — not "was this solve's OLL slow" but "which case keeps costing
 * you time." Built on demand (it re-runs the analyzer on each sampled
 * solve), not automatically, since that's real solver work, not a lookup.
 */
export function WeaknessReportCard() {
  const solves = useSessionStore((s) => s.solves);
  const { report, loading, progress, error, build } = useWeaknessStore();
  const candidates = useMemo(() => candidateSolves(solves), [solves]);

  if (candidates.length === 0) return null;

  const maxPhase = report ? Math.max(1, ...report.phases.map((p) => p.totalLost)) : 1;
  const maxCase = report ? Math.max(1, ...report.cases.map((c) => c.totalLost)) : 1;

  return (
    <div className="card rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <TrendingDown size={14} className="text-warning" />
          Weakness report
        </h3>
        <button
          type="button"
          onClick={() => void build(solves)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {report ? "Refresh" : "Build"}
        </button>
      </div>

      {!report && !loading && (
        <p className="text-xs leading-relaxed text-muted">
          {candidates.length} analyzed solve{candidates.length === 1 ? "" : "s"} available. Build the report to see
          which phases and cases are costing you the most across them.
        </p>
      )}

      {loading && (
        <p className="text-xs text-muted">
          Re-analyzing solve {progress.done + 1} of {progress.total}…
        </p>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {report && !loading && (
        <>
          {report.phases.length === 0 ? (
            <p className="text-xs text-success">
              Nothing stands out across the last {report.analyzedCount} analyzed solve
              {report.analyzedCount === 1 ? "" : "s"} — clean.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-2">By phase</p>
                <div className="space-y-1">
                  {report.phases.map((p) => (
                    <Row key={p.label} entry={p} max={maxPhase} />
                  ))}
                </div>
              </div>
              {report.cases.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-2">By case</p>
                  <div className="space-y-1">
                    {report.cases.slice(0, 5).map((c) => (
                      <Row key={c.label} entry={c} max={maxCase} />
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-muted-2">
                Across the last {report.analyzedCount} analyzed solve{report.analyzedCount === 1 ? "" : "s"}. Bar and
                first number are total extra moves lost to that phase or case; ×N is how many of those solves it
                showed up in.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
