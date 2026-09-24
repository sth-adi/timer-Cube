"use client";

import { useMemo } from "react";
import { Hourglass } from "lucide-react";
import { AnalyticsShell, NotEnough } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { useSessionStore } from "@/lib/store/sessionStore";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { MIN_SOLVES, analyzeAlgSpeed, type AlgSpeed, type AlgVerdict } from "@/lib/analysis/algSpeed";
import { cn } from "@/lib/utils/cn";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

const VERDICT: Record<AlgVerdict, { label: string; fix: string; tone: string }> = {
  "two-look": { label: "Two looks", fix: "Learn the one-look algorithm", tone: "bg-warning/15 text-warning" },
  hesitates: { label: "Stops partway", fix: "Drill until it runs without stopping", tone: "bg-warning/15 text-warning" },
  "slow-hands": { label: "Slow to turn", fix: "Drill the fingertricks", tone: "bg-accent/15 text-accent" },
  "long-route": { label: "Long route", fix: "Try a shorter alg or fewer regrips", tone: "bg-accent/15 text-accent" },
  fine: { label: "On pace", fix: "", tone: "bg-bg-panel-2 text-muted" },
};

function AlgRow({ a, baselineTps }: { a: AlgSpeed; baselineTps: number }) {
  const c = findCase(a.group, a.name);
  const v = VERDICT[a.verdict];
  return (
    <div className="card flex items-center gap-3 rounded-xl p-3">
      {c ? <CaseIcon setupAlg={invertAlg(c.alg)} kind={a.group} className="h-11 w-11 shrink-0 overflow-hidden rounded-[4px]" /> : <div className="h-11 w-11 shrink-0" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-foreground">
            {a.name} <span className="font-normal text-muted-2">{a.count}×</span>
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", v.tone)}>{v.label}</span>
        </p>
        <p className="text-[11px] tabular-nums text-muted-2">
          <span className={cn(a.medianTps < baselineTps * 0.85 && "text-foreground")}>{a.medianTps.toFixed(1)} TPS</span> · {a.medianTurns.toFixed(0)} turns
          {a.bookTurns !== null && <> (book {a.bookTurns})</>}
          {a.medianPauseMs >= 300 && <> · stops {secs(a.medianPauseMs)}</>}
        </p>
        {a.verdict !== "fine" && (
          <p className="text-[11px] text-foreground">
            {v.fix}
            {a.savableMs >= 50 && <span className="text-muted-2"> — {secs(a.savableMs)} each time</span>}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Alg Speed Check: every OLL and PLL you do regularly, judged against your
 * own last-layer pace — and told apart by *why* it's slow: a second look, a
 * stop partway, slow fingers, or a long route.
 */
export default function AlgSpeedPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeAlgSpeed(allSolves), [allSolves]);
  const eligible = allSolves.filter((s) => s.reconstruction && s.moveTimestamps && s.penalty !== "dnf").length;

  return (
    <AnalyticsShell icon={<Hourglass size={17} className="text-accent" />} title="Alg Speed Check" subtitle="Which OLLs and PLLs are slow — and why: a second look, a stop, or slow fingers.">
      {!r ? (
        <NotEnough need={MIN_SOLVES} have={eligible} what="Alg Speed Check" />
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{r.baselineTps.toFixed(1)}</p>
            <p className="text-xs font-medium text-muted">TPS on a typical last-layer alg, while turning</p>
            <p className="max-w-sm text-[11px] text-muted-2">
              {Math.round(r.twoLookOllShare * 100)}% of OLLs in two looks{r.lostMsPerSolve >= 50 && <> · {secs(r.lostMsPerSolve)}/solve to win back</>}
            </p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          {r.flagged.length > 0 && (
            <>
              <SectionTitle>Worth fixing, most time first</SectionTitle>
              {r.flagged.map((a) => (
                <AlgRow key={`${a.group}-${a.name}`} a={a} baselineTps={r.baselineTps} />
              ))}
            </>
          )}
          {r.algs.some((a) => a.verdict === "fine") && (
            <>
              <SectionTitle>On pace</SectionTitle>
              {r.algs
                .filter((a) => a.verdict === "fine")
                .map((a) => (
                  <AlgRow key={`${a.group}-${a.name}`} a={a} baselineTps={r.baselineTps} />
                ))}
            </>
          )}
          <p className="px-1 text-[10px] text-muted-2">
            TPS leaves out pauses, so it&apos;s your fingers alone. Book lengths count a slice move as two turns, the way the cube reports it. Savings compare against the
            book algorithm turned at your own pace.
          </p>
        </>
      )}
    </AnalyticsShell>
  );
}
