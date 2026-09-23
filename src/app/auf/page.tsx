"use client";

import { useMemo } from "react";
import Link from "next/link";
import { RefreshCcw, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { AUF_STAGE_LABEL, buildAufReport, solveAufs, type AufStageStats } from "@/lib/auf/aufAudit";
import { cn } from "@/lib/utils/cn";

const HISTORY = 200;
const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(2)}s`);

function StageCard({ s }: { s: AufStageStats }) {
  const total = Object.values(s.byNet).reduce((a, b) => a + b, 0);
  return (
    <div className="card flex flex-col gap-2.5 rounded-xl p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-foreground">{AUF_STAGE_LABEL[s.stage]}</p>
        <p className="text-[11px] text-muted-2">
          needed in {Math.round(s.neededRate * 100)}% of {s.samples}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [secs(s.avgWaitMs), s.stage === "final" ? "pause after PLL" : "pause before"],
          [secs(s.avgTurnMs), "turning"],
          [`${Math.round(s.wastedRate * 100)}%`, "extra turns"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-bg-panel-2 py-1.5">
            <p className={cn("text-base font-bold tabular-nums", l === "extra turns" && s.wastedRate > 0.12 ? "text-warning" : "text-foreground")}>{v}</p>
            <p className="text-[10px] text-muted-2">{l}</p>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex h-2 overflow-hidden rounded-full">
            {["U", "U2", "U'"].map((k, i) =>
              s.byNet[k] ? (
                <span key={k} style={{ flexGrow: s.byNet[k] }} className={["bg-accent", "bg-cyan", "bg-warning"][i]} title={`${k}: ${s.byNet[k]}`} />
              ) : null,
            )}
          </div>
          <p className="text-[10px] text-muted-2">
            {["U", "U2", "U'"]
              .filter((k) => s.byNet[k])
              .map((k) => `${k} ${Math.round((s.byNet[k] / total) * 100)}%`)
              .join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * AUF Audit: every last-layer adjustment across your smart-cube history —
 * how long you pause before it, how long it takes to turn, and how often
 * it goes the long way round.
 */
export default function AufPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const report = useMemo(() => {
    const eligible = allSolves
      .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0)
      .sort((a, b) => a.date - b.date)
      .slice(-HISTORY);
    return buildAufReport(
      eligible.map((s) => solveAufs({ scramble: s.scramble, moves: s.reconstruction!.split(/\s+/).filter(Boolean), timesMs: s.moveTimestamps! })),
    );
  }, [allSolves]);

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
              <RefreshCcw size={17} className="text-accent" /> AUF Audit
            </h1>
            <p className="text-[11px] text-muted-2">Every last-layer adjustment you&apos;ve made on a smart cube — the pauses, the turning, and the wasted turns.</p>
          </div>

          {!report ? (
            <div className="card rounded-xl p-6 text-center text-sm text-muted">Finish a few solves on a connected smart cube and your AUFs get audited here.</div>
          ) : (
            <>
              <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
                <p className="tabular-timer text-4xl font-bold text-foreground">{secs(report.avgOverheadMs)}</p>
                <p className="text-[11px] text-muted">per solve on AUFs — turning them, plus the pause before the last one ({report.solves} solves)</p>
              </div>
              <div className="card flex flex-col gap-2 rounded-xl p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">What to fix</p>
                {report.insights.map((i) => (
                  <p key={i} className="rounded-lg bg-bg-panel-2 px-3 py-2 text-[11px] text-foreground">
                    {i}
                  </p>
                ))}
              </div>
              {report.stages.map((s) => (
                <StageCard key={s.stage} s={s} />
              ))}
              <p className="px-1 text-[10px] text-muted-2">
                Shown as you hold the cube, yellow on top. An algorithm that happens to begin or end with a U turn counts that turn toward the AUF next to it.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
