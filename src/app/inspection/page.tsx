"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Eye, Timer as TimerIcon, TrendingDown, TrendingUp } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { GradeBadge, PlannedBar } from "@/components/inspection/InspectionGradeCard";
import { useSessionStore } from "@/lib/store/sessionStore";
import { inspectionReport, summarizeInspection, type InspectionReport } from "@/lib/inspection/report";
import { solveFinalMs, type Solve } from "@/types";
import { formatTime } from "@/lib/utils/time";

const HISTORY = 100;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-bg-panel-2 px-2 py-2 text-center">
      <p className="text-base font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] leading-tight text-muted-2">{label}</p>
    </div>
  );
}

/**
 * Inspection Report Card: grades the fifteen seconds before every
 * smart-cube solve from the only evidence they leave — how the cross came
 * out. One unbroken burst means you planned it all; a pause mid-cross is
 * exactly where your plan ran out.
 */
export default function InspectionPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const rows = useMemo(() => {
    const out: { solve: Solve; report: InspectionReport }[] = [];
    const eligible = allSolves
      .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0)
      .sort((a, b) => a.date - b.date)
      .slice(-HISTORY);
    for (const solve of eligible) {
      const report = inspectionReport(solve.scramble, solve.reconstruction!.split(/\s+/).filter(Boolean), solve.moveTimestamps!);
      if (report) out.push({ solve, report });
    }
    return out;
  }, [allSolves]);
  const history = useMemo(() => summarizeInspection(rows.map((r) => r.report)), [rows]);

  const w = 280;
  const h = 44;
  const points = rows
    .map((r, i) => `${rows.length === 1 ? w / 2 : (i / (rows.length - 1)) * w},${h - (r.report.score / 100) * (h - 4) - 2}`)
    .join(" ");

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
              <Eye size={17} className="text-accent" /> Inspection Report Card
            </h1>
            <p className="text-[11px] text-muted-2">Your inspection, graded from how your cross actually came out on the cube.</p>
          </div>

          {!history ? (
            <div className="card rounded-xl p-6 text-center text-sm text-muted">Solve on a connected smart cube and every inspection gets graded here.</div>
          ) : (
            <>
              <div className="card flex flex-col gap-3 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <GradeBadge grade={history.grade} size="lg" />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold text-foreground">Average over {history.solves} solves</p>
                    <p className="text-[11px] text-muted">
                      You plan {Math.round(history.avgPlannedFraction * 100)}% of your cross in inspection on average.
                    </p>
                    {history.trend !== null && (
                      <p className={history.trend >= 0 ? "flex items-center gap-1 text-[11px] text-success" : "flex items-center gap-1 text-[11px] text-danger"}>
                        {history.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {history.trend >= 0 ? "+" : ""}
                        {history.trend.toFixed(0)} points, recent half vs. older half
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={`${Math.round(history.fullyPlannedRate * 100)}%`} label="crosses fully planned" />
                  <Stat value={`+${history.avgExtraTurns.toFixed(1)}`} label="turns over optimal" />
                  <Stat value={`${Math.round(history.xcrossRate * 100)}%`} label="x-crosses" />
                </div>
                {rows.length > 1 && (
                  <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" preserveAspectRatio="none" aria-label="Inspection score over time">
                    <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
                <p className="text-[11px] text-muted">
                  {history.fullyPlannedRate < 0.5
                    ? "Most crosses stall part-way — in inspection, trace every edge to its slot before you start, not just the first two or three."
                    : history.avgExtraTurns > 1.5
                      ? "You plan your crosses fully, but they run long — spend part of inspection looking for a shorter one."
                      : history.xcrossRate < 0.1
                        ? "Planned and efficient. Next step: find an F2L pair you can build into the cross."
                        : "Excellent inspection — planned, efficient, and building x-crosses."}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">Recent solves</p>
                {[...rows]
                  .reverse()
                  .slice(0, 40)
                  .map(({ solve, report }) => {
                    const final = solveFinalMs(solve);
                    return (
                      <div key={solve.id} className="card flex items-center gap-3 rounded-xl p-3">
                        <GradeBadge grade={report.grade} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-foreground">
                              {final === null ? "DNF" : formatTime(final)}
                              <span className="font-normal text-muted-2"> · cross {formatTime(report.crossMs)}</span>
                            </span>
                            <span className="tabular-nums text-muted-2">
                              {report.plannedTurns}/{report.crossTurns} planned · opt {report.optimalTurns}
                              {report.xcross && <span className="ml-1 text-success">x-cross</span>}
                            </span>
                          </div>
                          <PlannedBar report={report} />
                          <p className="truncate text-[10px] text-muted">{report.notes.join(" ")}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
