"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, ScanLine, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { EmptyState } from "@/components/analysis/EmptyState";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { useSessionStore } from "@/lib/store/sessionStore";
import { runXray, xrayRequestFor } from "@/lib/xray/client";
import { useXrayHistory } from "@/components/xray/useXrayHistory";
import { pickXraySolve } from "@/components/xray/xraySelection";
import { buildXrayFindings } from "@/lib/xray/xrayCoach";
import type { SolveXray } from "@/lib/xray/solveXray";
import { summarizeFlowHistory } from "@/lib/xray/f2lFlow";
import { summarizeOracleHistory } from "@/lib/xray/lastSlotOracle";
import { buildMicroscope } from "@/lib/xray/algMicroscope";
import { buildNeutralityReport } from "@/lib/xray/neutrality";
import { F2lFlowChart } from "@/components/xray/F2lFlowChart";
import { LastSlotOracleCard } from "@/components/xray/LastSlotOracleCard";
import { AlgMicroscopePanel, SolveAlgMicroscope } from "@/components/xray/AlgMicroscopePanel";
import { NeutralityHistory, SolveNeutrality } from "@/components/xray/NeutralityPanel";
import { solveFinalMs, type Solve } from "@/types";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("flex flex-col gap-3 border-t border-border pt-5", className)}>{children}</section>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="max-w-prose text-xs text-muted-2">{subtitle}</p>}
    </div>
  );
}

const PICKER_LIMIT = 40;

function SolvePicker({ solves, selectedId, onPick }: { solves: Solve[]; selectedId: string | null; onPick: (id: string) => void }) {
  const stripRef = useRef<HTMLDivElement>(null);
  // A solve linked from a recap can be older than the strip's window: show it first rather than selecting something unseen.
  const shown = useMemo(() => {
    const recent = solves.slice(0, PICKER_LIMIT);
    const linked = selectedId && !recent.some((s) => s.id === selectedId) ? solves.find((s) => s.id === selectedId) : undefined;
    return linked ? [linked, ...recent] : recent;
  }, [solves, selectedId]);
  // On a phone the strip scrolls sideways: bring the selected solve into view when it changes.
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [selectedId]);
  return (
    <div ref={stripRef} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {shown.map((s) => {
        const final = solveFinalMs(s);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            aria-pressed={s.id === selectedId}
            className={cn(
              "flex shrink-0 flex-col items-start rounded-lg px-2.5 py-1.5 text-left transition-colors",
              s.id === selectedId ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-foreground hover:bg-bg-panel-2/70",
            )}
          >
            <span className="tabular-timer text-xs font-semibold">{final === null ? "DNF" : formatTime(final)}</span>
            <span className={cn("text-[11px]", s.id === selectedId ? "text-accent-fg/80" : "text-muted-2")}>
              {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
              {new Date(s.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Solve X-Ray: four analyses that only exist because a smart cube records
 * every turn of a real solve against its real scramble —
 *
 *  - **F2L Flow**: each pair's true distance-to-solved, turn by turn, and
 *    whether you picked the easiest pair and set up the next ones;
 *  - **Last Slot Oracle**: every short insertion for your last pair and the
 *    OLL each would have left you (skips included);
 *  - **Alg Microscope**: the algorithms you actually execute, timed turn
 *    by turn to find where your hands stall;
 *  - **Neutrality Scout**: all six colors' crosses on every scramble you
 *    solved, priced in seconds at your own cross speed.
 */
export default function XrayPage() {
  return (
    <Suspense fallback={null}>
      <XrayPageInner />
    </Suspense>
  );
}

function XrayPageInner() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const { candidates, results: historyResults, done: historyDone, total: historyTotal, scanning } = useXrayHistory(allSolves);
  // A deep link from a recap — /xray?solve=<id> — opens on that solve; without one, the newest.
  const linkedId = useSearchParams().get("solve");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const { selected, linkMissing } = pickXraySolve(candidates, pickedId, linkedId);

  const [xray, setXray] = useState<{ id: string; result: SolveXray | null } | null>(null);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    runXray(xrayRequestFor(selected))
      .then((result) => !cancelled && setXray({ id: selected.id, result }))
      .catch(() => !cancelled && setXray({ id: selected.id, result: null }));
    return () => {
      cancelled = true;
    };
  }, [selected]);
  const current = xray && selected && xray.id === selected.id ? xray : null;

  const flowHistory = useMemo(() => summarizeFlowHistory(historyResults.flatMap((r) => (r.flow ? [r.flow] : []))), [historyResults]);
  const oracleHistory = useMemo(() => summarizeOracleHistory(historyResults.flatMap((r) => (r.oracle ? [r.oracle] : []))), [historyResults]);
  const microscope = useMemo(() => buildMicroscope(historyResults.flatMap((r) => r.executions)), [historyResults]);
  const neutrality = useMemo(() => buildNeutralityReport(historyResults.flatMap((r) => (r.neutrality ? [r.neutrality] : []))), [historyResults]);
  const plan = useMemo(() => buildXrayFindings(historyResults), [historyResults]);

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="hit flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>

        <div className="flex w-full max-w-xl flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ScanLine size={17} className="text-accent" /> Solve X-Ray
            </h1>
            <p className="text-[11px] text-muted-2">Every turn of your smart-cube solves, replayed against the real scramble.</p>
          </div>

          {candidates.length === 0 ? (
            <EmptyState title="No smart-cube solves yet" href="/" action="Open timer">
              <p>Solve on a connected smart cube and each solve shows up here for a full X-Ray.</p>
            </EmptyState>
          ) : (
            <>
              {linkMissing && <p className="px-1 text-[11px] text-muted-2">That solve can&apos;t be X-Rayed (it may have been deleted), so here&apos;s your newest one.</p>}
              <SolvePicker solves={candidates} selectedId={selected?.id ?? null} onPick={setPickedId} />

              {!current ? (
                <SkeletonGroup label="Replaying every turn" className="flex flex-col gap-3 border-t border-border pt-5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-4 w-56" />
                </SkeletonGroup>
              ) : !current.result ? (
                <Card>
                  <p className="text-sm text-muted">This solve couldn&apos;t be replayed against its scramble. Pick another solve above.</p>
                </Card>
              ) : (
                <>
                  <Card>
                    {current.result.flow ? (
                      <F2lFlowChart report={current.result.flow} />
                    ) : (
                      <p className="text-sm text-muted">This solve has no complete cross and F2L to chart.</p>
                    )}
                  </Card>
                  <Card>
                    {current.result.oracle ? (
                      <LastSlotOracleCard report={current.result.oracle} />
                    ) : (
                      <p className="text-sm text-muted">No single last slot to analyze: two pairs finished together, or F2L never completed.</p>
                    )}
                  </Card>
                  <Card>
                    <SolveAlgMicroscope executions={current.result.executions} />
                  </Card>
                  {current.result.neutrality && (
                    <Card>
                      <SolveNeutrality solve={current.result.neutrality} />
                    </Card>
                  )}
                </>
              )}

              <div className="flex items-baseline gap-2 px-1 pt-6">
                <h2 className="text-base font-semibold text-foreground">Across your solves</h2>
                {scanning && (
                  <span className="ml-auto flex items-center gap-1 text-xs tabular-nums text-muted-2">
                    <Loader2 size={11} className="animate-spin" /> Scanning {historyDone} of {historyTotal}
                  </span>
                )}
              </div>

              {plan.length > 0 && (
                <Card>
                  <SectionTitle title="What to fix first" subtitle="All four analyses, priced in seconds per solve against your own better solves." />
                  <ol className="flex flex-col divide-y divide-border">
                    {plan.map((f, i) => (
                      <li key={f.id} className={cn("flex flex-col gap-1 py-3 first:pt-0 last:pb-0", i === 0 && "text-base")}>
                        <div className="flex items-start justify-between gap-3">
                          <p className={cn("font-semibold text-foreground", i === 0 ? "text-base" : "text-sm")}>
                            {i + 1}. {f.title}
                          </p>
                          <span className={cn("shrink-0 font-semibold tabular-nums text-accent", i === 0 ? "text-base" : "text-sm")}>{(f.msPerSolve / 1000).toFixed(2)}s</span>
                        </div>
                        <p className="text-xs text-muted">{f.detail}</p>
                        <p className="text-xs font-medium text-foreground">{f.action}</p>
                      </li>
                    ))}
                  </ol>
                  <Link href="/coach" className="hit-y text-xs font-medium text-accent">
                    See it ranked in Coach
                  </Link>
                </Card>
              )}

              <Card>
                <SectionTitle title="Alg microscope"
                  subtitle="The algorithms you actually use for every case, with recognition and execution time. Open a case to see its turn-by-turn timing and where you stall."
                />
                <AlgMicroscopePanel cases={microscope} />
              </Card>

              {flowHistory && (
                <Card>
                  <SectionTitle title="F2L flow" subtitle={`${flowHistory.solves} solves`} />
                  <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <Stat value={Math.round(flowHistory.avgFlowScore).toString()} label="avg flow score" />
                    <Stat value={`${Math.round(flowHistory.easiestPickRate * 100)}%`} label="easiest pair picked" />
                    <Stat value={flowHistory.setupPerSolve.toFixed(1)} label="free setup / solve" tone="success" />
                    <Stat value={flowHistory.scatterPerSolve.toFixed(1)} label="scatter / solve" tone="danger" />
                  </div>
                  <p className="text-[11px] text-muted">
                    {flowHistory.easiestPickRate < 0.6
                      ? `You start on a harder pair than necessary ${Math.round((1 - flowHistory.easiestPickRate) * 100)}% of the time, about ${flowHistory.avgRegret.toFixed(1)} extra turns each time. Scan for the easiest pair before committing.`
                      : "You usually go for the easiest pair available, good pair selection."}
                  </p>
                </Card>
              )}

              {oracleHistory && (
                <Card>
                  <SectionTitle title="Last slot oracle" subtitle={`${oracleHistory.solves} most recent solves`} />
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat value={`${Math.round(oracleHistory.skipAvailableRate * 100)}%`} label="an OLL skip was an insert away" tone="success" />
                    <Stat value={`${Math.round(oracleHistory.skipTakenRate * 100)}%`} label="skips you actually got" />
                    <Stat value={oracleHistory.avgTurnsSaved.toFixed(1)} label="turns a better insert saves" />
                  </div>
                </Card>
              )}

              {neutrality && (
                <Card>
                  <SectionTitle title="Neutrality scout"
                    subtitle="Would learning more cross colors pay off for you? Measured on the scrambles you actually solved."
                  />
                  <NeutralityHistory report={neutrality} />
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-lg bg-bg-panel-2 px-2 py-2.5">
      <p className={cn("text-base font-bold tabular-nums", tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground")}>
        {value}
      </p>
      <p className="text-[11px] leading-tight text-muted-2">{label}</p>
    </div>
  );
}
