"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Flag, GraduationCap, Loader2, ScanLine } from "lucide-react";
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
              ? `Your biggest lever: ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)} — about ${secs(top.msPerSolve)} a solve.`
              : (r?.headline ?? "")}
          </p>
          {xray.scanning && (
            <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-2">
              <Loader2 size={11} className="animate-spin" /> X-Raying your smart-cube solves for more — {xray.done}/{xray.total}
            </p>
          )}

          {findings.map((f, i) => (
            <Link key={f.id} href={f.href} className="card flex flex-col gap-2 rounded-xl p-4 transition-colors hover:bg-bg-panel-2/60">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-start gap-2 text-sm font-semibold leading-snug text-foreground">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">{i + 1}</span>
                  <span>
                    {f.title}
                    {f.source === "xray" && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-bg-panel-2 px-1.5 py-0.5 align-middle text-[9px] font-medium text-muted">
                        <ScanLine size={9} /> X-Ray
                      </span>
                    )}
                  </span>
                </p>
                <span className="shrink-0 text-sm font-bold tabular-nums text-accent">{secs(f.msPerSolve)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-panel-2">
                <div className="h-full rounded-full bg-accent/70" style={{ width: `${(f.msPerSolve / max) * 100}%` }} />
              </div>
              <p className="text-[11px] leading-relaxed text-muted">{f.detail}</p>
              <p className="flex items-center justify-between gap-2 text-[11px] font-medium text-foreground">
                {f.action}
                <ChevronRight size={14} className="shrink-0 text-muted-2" />
              </p>
            </Link>
          ))}
          {findings.length > 0 && (
            <p className="px-1 text-[10px] text-muted-2">
              Seconds per solve, measured against what you already do on your better solves. Some fixes overlap, so treat a combined total as an upper bound.
            </p>
          )}

          {r?.goal && (
            <Link href="/goal" className="card flex flex-col gap-2 rounded-xl p-4 transition-colors hover:bg-bg-panel-2/60">
              <SectionTitle>Next goal</SectionTitle>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Flag size={15} className="text-accent" />
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
