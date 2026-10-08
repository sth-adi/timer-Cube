"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import { ChevronRight, GraduationCap, Loader2 } from "lucide-react";
import { AnalyticsShell, NotEnough } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_SOLVES, analyzeCoach } from "@/lib/analysis/labCoach";
import { useXrayHistory } from "@/components/xray/useXrayHistory";
import { buildXrayFindings, mergeFindings } from "@/lib/xray/xrayCoach";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/**
 * Coach: every report that can put a number of seconds on a fix, ranked by
 * how much of a solve that fix is worth — so the first thing on the page is
 * the best use of your next practice session.
 */
export default function CoachPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeCoach(allSolves), [allSolves]);
  const xray = useXrayHistory(allSolves);
  const xrayFindings = useMemo(() => buildXrayFindings(xray.results), [xray.results]);
  const findings = useMemo(() => mergeFindings(r?.findings ?? [], xrayFindings), [r, xrayFindings]);
  const eligible = allSolves.filter((s) => s.reconstruction && s.moveTimestamps && s.penalty !== "dnf").length;
  const max = Math.max(1, ...findings.map((f) => f.msPerSolve));
  const top = findings[0];

  return (
    <AnalyticsShell icon={<GraduationCap size={17} className="text-accent" />} title="Coach" subtitle="Where your time goes, ranked by what fixing it is worth.">
      {!r && findings.length === 0 ? (
        <NotEnough need={MIN_SOLVES} have={eligible} what="Coach" />
      ) : (
        <>
          <p className="px-1 text-[13px] leading-relaxed text-foreground">
            {top
              ? `Your biggest lever: ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}, about ${secs(top.msPerSolve)} a solve.`
              : (r?.headline ?? "")}
          </p>
          {xray.scanning && (
            <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-2">
              <Loader2 size={11} className="animate-spin" /> X-Raying your smart-cube solves for more, {xray.done}/{xray.total}
            </p>
          )}

          <div className="flex flex-col">
            {findings.map((f, i) => (
              <Link
                key={f.id}
                href={f.href}
                className={cn(
                  "flex flex-col gap-2 transition-colors",
                  i === 0 ? "card rounded-xl p-4 hover:bg-bg-panel-2/60" : "border-t border-border py-4 first:border-t-0",
                  i === 1 && "mt-4",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={cn("flex items-start gap-2 font-semibold leading-snug text-foreground", i === 0 ? "text-base" : "text-sm")}>
                    <span className="shrink-0 tabular-nums text-accent">{i + 1}.</span>
                    <span>
                      {f.title}
                      {f.source === "xray" && <span className="ml-1.5 align-middle text-[11px] font-medium text-muted-2">from X-Ray</span>}
                    </span>
                  </p>
                  <span className={cn("shrink-0 font-semibold tabular-nums text-accent", i === 0 ? "text-base" : "text-sm")}>{secs(f.msPerSolve)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-panel-2">
                  <div className="h-full rounded-md bg-accent/70" style={{ width: `${(f.msPerSolve / max) * 100}%` }} />
                </div>
                <p className="text-xs leading-relaxed text-muted">{f.detail}</p>
                <p className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
                  {f.action}
                  <ChevronRight size={14} className="shrink-0 text-muted-2" />
                </p>
              </Link>
            ))}
          </div>
          {findings.length > 0 && (
            <p className="px-1 text-[11px] text-muted-2">
              Seconds per solve, measured against what you already do on your better solves. Some fixes overlap, so treat a combined total as an upper bound.
            </p>
          )}

          {r?.goal && (
            <Link href="/goal" className="flex flex-col gap-2 border-t border-border pt-5 transition-colors">
              <SectionTitle>Next goal</SectionTitle>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                Sub-{(r.goal.targetMs / 1000).toFixed(0)} from a typical {secs(r.goal.currentMs)}
              </p>
              <p className="text-[11px] leading-relaxed text-muted">{r.goal.headline}</p>
              <p className="flex items-center justify-between text-[11px] font-medium text-foreground">
                Plan it phase by phase
                <ChevronRight size={14} className="text-muted-2" />
              </p>
            </Link>
          )}
        </>
      )}
    </AnalyticsShell>
  );
}
