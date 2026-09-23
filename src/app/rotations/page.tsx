"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Rotate3d, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { SLOT_POS_LABEL, analyzeRotations, buildRotationReport, type SlotStats } from "@/lib/rotations/audit";
import { cn } from "@/lib/utils/cn";

const HISTORY = 200;
const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(2)}s`);

function SlotTile({ s }: { s: SlotStats }) {
  const hot = s.pairs >= 4 && s.rotatedRate >= 0.5;
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-0.5 rounded-lg p-2 text-center", hot ? "bg-warning/20" : "bg-bg-panel-2")}
      title={`${s.pairs} pairs started ${SLOT_POS_LABEL[s.pos]}`}
    >
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-2">{SLOT_POS_LABEL[s.pos]}</span>
      <span className={cn("text-xl font-black tabular-nums", hot ? "text-warning" : "text-foreground")}>{s.pairs ? `${Math.round(s.rotatedRate * 100)}%` : "—"}</span>
      <span className="text-[9px] text-muted">rotated · {s.pairs} pairs</span>
      {s.msRotated !== null && s.msStill !== null && (
        <span className="text-[9px] tabular-nums text-muted-2">
          {secs(s.msRotated)} vs {secs(s.msStill)}
        </span>
      )}
    </div>
  );
}

/**
 * Rotation Audit: from every gyro-cube solve, why you rotate — which slot
 * positions make you turn the whole cube, and what those rotations cost.
 */
export default function RotationsPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const report = useMemo(() => {
    const eligible = allSolves
      .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps?.length && s.rotations && s.orientedReconstruction)
      .sort((a, b) => a.date - b.date)
      .slice(-HISTORY);
    return buildRotationReport(
      eligible.map((s) =>
        analyzeRotations({
          scramble: s.scramble,
          moves: s.reconstruction!.split(/\s+/).filter(Boolean),
          timesMs: s.moveTimestamps!,
          rotations: s.rotations!,
          orientedReconstruction: s.orientedReconstruction!,
        }),
      ),
    );
  }, [allSolves]);

  const maxTrend = report ? Math.max(1, ...report.trend) : 1;
  const tile = (pos: SlotStats["pos"]) => report!.bySlot.find((s) => s.pos === pos)!;

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
              <Rotate3d size={17} className="text-accent" /> Rotation Audit
            </h1>
            <p className="text-[11px] text-muted-2">Why you turn the whole cube, and what it costs — from every gyro-cube solve.</p>
          </div>

          {!report ? (
            <div className="card rounded-xl p-6 text-center text-sm text-muted">
              Needs solves from a gyro smart cube (GAN Gen2+, MoYu AI…). Once you&apos;ve done a few, every rotation gets audited here.
            </div>
          ) : (
            <>
              <div className="card grid grid-cols-3 gap-2 rounded-xl p-4 text-center">
                {[
                  [report.perSolve.toFixed(1), "rotations / solve"],
                  [secs(report.avgCostMs), "each one costs"],
                  [secs(report.costPerSolveMs), "per solve"],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-lg bg-bg-panel-2 py-2">
                    <p className="text-lg font-bold tabular-nums text-foreground">{v}</p>
                    <p className="text-[10px] text-muted-2">{l}</p>
                  </div>
                ))}
                <p className="col-span-3 text-[10px] text-muted-2">
                  Cost is how much longer the gap around a rotation was than your usual gap between turns. {report.solves} gyro solves.
                </p>
              </div>

              <div className="card flex flex-col gap-3 rounded-xl p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">F2L pairs by where their slot was when you started on them</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["BL", "BR", "FL", "FR"] as const).map((p) => (
                    <SlotTile key={p} s={tile(p)} />
                  ))}
                </div>
                <p className="text-center text-[10px] text-muted-2">▲ back of the cube · you are here ▼</p>
                <p className="text-[10px] text-muted-2">% of pairs you rotated for, and their time with vs without a rotation.</p>
              </div>

              <div className="card flex flex-col gap-2 rounded-xl p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">What to fix</p>
                {report.insights.map((i) => (
                  <p key={i} className="rounded-lg bg-bg-panel-2 px-3 py-2 text-[11px] text-foreground">
                    {i}
                  </p>
                ))}
              </div>

              <div className="card flex flex-col gap-3 rounded-xl p-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Rotations per solve, by phase</p>
                  {(
                    [
                      ["Cross", report.byPhase.cross],
                      ["F2L", report.byPhase.f2l],
                      ["Last layer", report.byPhase.ll],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-16 text-[11px] text-muted">{label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-panel-2">
                        <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.min(100, (v / Math.max(0.5, report.perSolve)) * 100)}%` }} />
                      </div>
                      <span className="w-8 text-right text-[10px] tabular-nums text-muted-2">{v.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                {report.tokenCounts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {report.tokenCounts.slice(0, 8).map((t) => (
                      <span key={t.token} className="rounded-full bg-bg-panel-2 px-2.5 py-1 font-mono text-[11px] text-foreground">
                        {t.token} <span className="text-muted-2">×{t.count}</span>
                      </span>
                    ))}
                  </div>
                )}
                {report.trend.length > 1 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Rotations in each solve, oldest to newest</p>
                    <div className="flex h-10 items-end gap-[2px]">
                      {report.trend.map((v, i) => (
                        <div key={i} className="flex-1 rounded-t-sm bg-accent/60" style={{ height: `${Math.max(4, (v / maxTrend) * 100)}%` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
