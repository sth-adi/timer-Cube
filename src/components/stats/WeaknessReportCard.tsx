"use client";

import { useMemo } from "react";
import { Loader2, RefreshCw, TrendingDown } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { candidateSolves, useWeaknessStore } from "@/lib/store/weaknessStore";
import type { WeaknessEntry } from "@/lib/analysis/weaknessReport";

const secs = (ms: number) => `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)}s`;

/** Bar split into pausing (to look) and extra moves (priced at your turning speed). */
function Row({ entry, max, byTime }: { entry: WeaknessEntry; max: number; byTime: boolean }) {
  const value = byTime ? entry.lostMs : entry.totalLost;
  const pauseShare = entry.lostMs > 0 ? entry.pauseMs / entry.lostMs : 0;
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted">{entry.label}</span>
      <div className="relative flex h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
        <div className="flex h-full" style={{ width: `${width}%` }}>
          {byTime && <div className="h-full bg-danger/45" style={{ width: `${pauseShare * 100}%` }} />}
          <div className="h-full flex-1 bg-warning/45" />
        </div>
      </div>
      <span
        className="w-24 shrink-0 text-right tabular-nums text-muted-2"
        title={`${entry.totalLost} extra move${entry.totalLost === 1 ? "" : "s"}; ${secs(entry.pauseMs)} pausing${entry.estimated ? `; ${entry.estimated} estimated without move timing` : ""}`}
      >
        {byTime ? `${entry.estimated ? "~" : ""}${secs(entry.lostMs)}` : `+${entry.totalLost}`} · ×{entry.occurrences}
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

  // Rank and draw by time whenever any timing (measured or estimated) exists; only fall back to moves without it.
  const byTime = !!report && [...report.phases, ...report.cases].some((e) => e.lostMs > 0);
  const size = (e: WeaknessEntry) => (byTime ? e.lostMs : e.totalLost);
  const maxPhase = report ? Math.max(1, ...report.phases.map(size)) : 1;
  const maxCase = report ? Math.max(1, ...report.cases.map(size)) : 1;

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
                    <Row key={p.label} entry={p} max={maxPhase} byTime={byTime} />
                  ))}
                </div>
              </div>
              {report.cases.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-2">By case</p>
                  <div className="space-y-1">
                    {report.cases.slice(0, 5).map((c) => (
                      <Row key={c.label} entry={c} max={maxCase} byTime={byTime} />
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-muted-2">
                Across the last {report.analyzedCount} analyzed solve{report.analyzedCount === 1 ? "" : "s"}.{" "}
                {byTime ? (
                  <>
                    Ranked by time lost: <span className="text-danger">pausing to look</span> plus{" "}
                    <span className="text-warning">extra moves</span> priced at your own turning speed.{" "}
                    {report.timedCount < report.analyzedCount &&
                      `${report.analyzedCount - report.timedCount} had no per-move timing, so their pauses are unknown and moves are priced at the solve's average pace (~). `}
                  </>
                ) : (
                  "No timing available, so this ranks by extra moves. "
                )}
                ×N is how many of those solves it showed up in.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
