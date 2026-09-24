"use client";

import { useMemo } from "react";
import { Binoculars } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_HANDOFFS, analyzeLookahead } from "@/lib/analysis/lookahead";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

const VERDICT = {
  "slow-down": "Slowing down pays",
  "keep-pace": "Slowing down doesn't pay yet",
  "no-link": "Not looking ahead yet",
} as const;

/**
 * Lookahead Tradeoff: does turning an F2L pair more calmly actually shorten
 * the pause before the next one — and is the pause saved worth the turning
 * time spent?
 */
export default function LookaheadPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeLookahead(allSolves), [allSolves]);

  const rows = r
    ? [
        { label: "After a rushed pair", pace: r.fastMsPerTurn, pause: r.pauseAfterFastMs },
        { label: "After a calm pair", pace: r.slowMsPerTurn, pause: r.pauseAfterSlowMs },
      ]
    : [];
  const maxPause = Math.max(1, ...rows.map((x) => x.pause));

  return (
    <AnalyticsShell icon={<Binoculars size={17} className="text-accent" />} title="Lookahead Tradeoff" subtitle="Does turning F2L calmer shorten your next pause — and is it worth it?">
      {!r ? (
        <div className="card flex flex-col gap-1 rounded-xl p-6 text-center">
          <p className="text-sm text-muted">Lookahead Tradeoff needs at least {MIN_HANDOFFS} back-to-back F2L pair hand-offs.</p>
          <p className="text-[11px] text-muted-2">Each smart-cube solve adds up to three — keep going and this fills in.</p>
        </div>
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-2xl font-bold text-foreground">{VERDICT[r.verdict]}</p>
            <p className="max-w-sm text-[11px] text-muted-2">from {r.handoffs} pair hand-offs</p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Pause before the next pair</SectionTitle>
            {rows.map((x) => (
              <div key={x.label} className="flex flex-col gap-1">
                <p className="flex justify-between text-[11px]">
                  <span className="text-foreground">{x.label}</span>
                  <span className="tabular-nums text-muted-2">{Math.round(x.pace)}ms/turn</span>
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
                    <div className="absolute inset-y-0 left-0 rounded bg-accent/60" style={{ width: `${(x.pause / maxPause) * 100}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-foreground">{secs(x.pause)}</span>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              {[
                { label: "pause saved", value: secs(r.pauseAfterFastMs - r.pauseAfterSlowMs) },
                { label: "turning cost", value: secs(r.slowdownCostMs) },
                { label: "net per pair", value: `${r.netGainMs >= 0 ? "+" : "−"}${secs(Math.abs(r.netGainMs))}` },
              ].map((x) => (
                <div key={x.label} className="rounded-lg bg-bg-panel-2 px-2 py-2">
                  <p className="text-sm font-semibold tabular-nums text-foreground">{x.value}</p>
                  <p className="text-[10px] text-muted-2">{x.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-2">
              Pairs are split at your median turning pace. Pace leaves out stops, so a pair where you paused to find a piece doesn&apos;t count as calm turning.
            </p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
