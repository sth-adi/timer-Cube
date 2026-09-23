"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Crosshair, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { PAIR_COLORS } from "@/lib/xray/common";
import {
  CORNER_SPOT_LABEL,
  EDGE_SPOT_LABEL,
  MIN_CELL,
  SPOTS,
  buildBlindSpots,
  pairSegments,
  type Metric,
  type SpotCell,
} from "@/lib/blindspots/blindSpots";
import { cn } from "@/lib/utils/cn";

const HISTORY = 200;

const METRICS: { key: Metric; label: string; blurb: string }[] = [
  { key: "findMs", label: "Finding", blurb: "the pause before your first turn on the pair — pure lookahead" },
  { key: "execMs", label: "Solving", blurb: "from your first turn on the pair until it's in" },
  { key: "totalMs", label: "Total", blurb: "finding plus solving" },
];

const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(2)}s`);

/** Green at or under your average, through amber, to red at 1.5× it. */
function heat(ratio: number): string {
  const t = Math.max(0, Math.min(1, (ratio - 0.85) / 0.65));
  return `hsl(${140 - t * 140} 70% 45% / ${0.25 + t * 0.45})`;
}

function Cell({ cell, metric, baseline }: { cell: SpotCell; metric: Metric; baseline: number }) {
  const v = cell[metric];
  const enough = cell.count >= MIN_CELL && v !== null;
  return (
    <div
      className={cn("flex aspect-square flex-col items-center justify-center rounded-lg text-center", !enough && "bg-bg-panel-2")}
      style={enough ? { background: heat(v! / baseline) } : undefined}
      title={`${CORNER_SPOT_LABEL[cell.corner]}, ${EDGE_SPOT_LABEL[cell.edge]}`}
    >
      <span className={cn("text-sm font-bold tabular-nums", enough ? "text-foreground" : "text-muted-2")}>{cell.count ? secs(v) : "—"}</span>
      <span className="text-[9px] text-muted">{cell.count} pair{cell.count === 1 ? "" : "s"}</span>
    </div>
  );
}

/**
 * F2L Blind Spots: where your F2L pairs' pieces were when you went looking
 * for them, and what each situation costs you — the map of what your
 * lookahead can't see.
 */
export default function BlindSpotsPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const [metric, setMetric] = useState<Metric>("findMs");

  const report = useMemo(() => {
    const eligible = allSolves
      .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0)
      .sort((a, b) => a.date - b.date)
      .slice(-HISTORY);
    return buildBlindSpots(
      eligible.map((s) => pairSegments({ scramble: s.scramble, moves: s.reconstruction!.split(/\s+/).filter(Boolean), timesMs: s.moveTimestamps! })),
    );
  }, [allSolves]);

  const m = METRICS.find((x) => x.key === metric)!;
  const maxPair = report ? Math.max(1, ...report.byPair.map((p) => p.totalMs ?? 0)) : 1;
  const maxOrder = report ? Math.max(1, ...report.byOrder.map((o) => o.findMs ?? 0)) : 1;

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Crosshair size={17} className="text-accent" /> F2L Blind Spots
            </h1>
            <p className="text-[11px] text-muted-2">Every F2L pair you&apos;ve solved on a smart cube, filed by where its pieces were when you went looking for it.</p>
          </div>

          {!report ? (
            <div className="card rounded-xl p-6 text-center text-sm text-muted">Solve on a connected smart cube and each F2L pair lands on this map.</div>
          ) : (
            <>
              <div className="card flex flex-col gap-3 rounded-xl p-4">
                <p className="text-[11px] text-muted">
                  {report.pairs} pairs from {report.solves} solves. On average a pair takes you {secs(report.overall.findMs)} to find and{" "}
                  {secs(report.overall.execMs)} to solve.
                </p>
                <div className="flex rounded-full bg-bg-panel-2 p-1">
                  {METRICS.map((x) => (
                    <button
                      key={x.key}
                      type="button"
                      onClick={() => setMetric(x.key)}
                      className={cn("flex-1 rounded-full py-1.5 text-xs font-semibold", metric === x.key ? "bg-accent text-accent-fg" : "text-muted")}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-2">
                  {m.label}: {m.blurb}. Average {secs(report.overall[metric])}.
                </p>

                <div className="grid grid-cols-[4.5rem_repeat(3,1fr)] gap-1.5">
                  <span />
                  {SPOTS.map((e) => (
                    <span key={e} className="text-center text-[9px] font-medium uppercase leading-tight tracking-wide text-muted-2">
                      Edge {e === "top" ? "up top" : e === "slot" ? "in other slot" : "flipped in slot"}
                    </span>
                  ))}
                  {SPOTS.map((c) => (
                    <div key={c} className="contents">
                      <span className="flex items-center text-[9px] font-medium uppercase leading-tight tracking-wide text-muted-2">
                        Corner {c === "top" ? "up top" : c === "slot" ? "in other slot" : "twisted in slot"}
                      </span>
                      {SPOTS.map((e) => (
                        <Cell key={e} cell={report.cells.find((x) => x.corner === c && x.edge === e)!} metric={metric} baseline={report.overall[metric]} />
                      ))}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-2">Green is at or under your average, red is 1.5× it. Needs {MIN_CELL}+ pairs to color a square.</p>
              </div>

              <div className="card flex flex-col gap-2 rounded-xl p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Your blind spots</p>
                {report.insights.length === 0 ? (
                  <p className="text-[11px] text-muted">No situation stands out yet — every kind of pair costs you about the same. That&apos;s a well-rounded F2L.</p>
                ) : (
                  report.insights.slice(0, 4).map((i) => (
                    <div key={i.label + i.metric} className="flex flex-col gap-0.5 rounded-lg bg-bg-panel-2 px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">{i.label}</p>
                      <p className="text-[11px] text-muted">
                        {i.metric === "findMs"
                          ? `Takes ${secs(i.ms)} to find, vs ${secs(i.baselineMs)} on average — your eyes aren't tracking these pieces during the previous pair.`
                          : `Takes ${secs(i.ms)} to solve once found, vs ${secs(i.baselineMs)} on average — worth drilling this case's insertions.`}{" "}
                        <span className="text-muted-2">({i.count} pairs)</span>
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="card flex flex-col gap-3 rounded-xl p-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">By pair (total time)</p>
                  {report.byPair.map((p, i) => (
                    <div key={p.label} className="flex items-center gap-2">
                      <span className="flex w-24 items-center gap-1.5 text-[11px] text-muted">
                        <span className="flex overflow-hidden rounded-[3px] ring-1 ring-black/30">
                          {PAIR_COLORS[i].map((c) => (
                            <span key={c} className="h-3 w-2" style={{ background: c }} />
                          ))}
                        </span>
                        {p.label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-panel-2">
                        <div className="h-full rounded-full bg-accent/70" style={{ width: `${((p.totalMs ?? 0) / maxPair) * 100}%` }} />
                      </div>
                      <span className="w-12 text-right text-[10px] tabular-nums text-muted-2">{secs(p.totalMs)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Finding time, 1st to 4th pair</p>
                  <div className="flex h-16 items-end gap-2">
                    {report.byOrder.map((o) => (
                      <div key={o.order} className="flex flex-1 flex-col items-center gap-1">
                        <div className="w-full rounded-t-sm bg-accent/70" style={{ height: `${Math.max(4, ((o.findMs ?? 0) / maxOrder) * 44)}px` }} />
                        <span className="text-[9px] tabular-nums text-muted-2">
                          #{o.order} · {secs(o.findMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-2">A tall first bar is the cross-to-F2L transition; tall middle bars mean lookahead stops during insertions.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
