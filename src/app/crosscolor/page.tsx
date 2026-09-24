"use client";

import { useMemo } from "react";
import { Palette } from "lucide-react";
import { AnalyticsShell, NotEnough } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_SCRAMBLES, analyzeCrossOrientations } from "@/lib/analysis/crossAdvisor";

const COLOR_SWATCH: Record<string, string> = {
  white: "#f4f4f4",
  yellow: "#f5d90a",
  red: "#e53935",
  orange: "#fb8c00",
  green: "#43a047",
  blue: "#1e88e5",
};

/**
 * Cross Color Advisor: this app always solves on white — a fixed
 * convention — but a whole-cube rotation of the same scramble tells you
 * exactly how long the cross would have been on any other color.
 */
export default function CrossColorPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const r = useMemo(() => analyzeCrossOrientations(allSolves), [allSolves]);
  const eligible = allSolves.filter((s) => s.scramble && s.penalty !== "dnf").length;

  return (
    <AnalyticsShell
      icon={<Palette size={17} className="text-accent" />}
      title="Cross Color Advisor"
      subtitle="How long your cross would have been on every other color."
    >
      {!r ? (
        <NotEnough need={MIN_SCRAMBLES} have={eligible} what="Cross Color Advisor" />
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{r.current.avgLen.toFixed(2)}</p>
            <p className="text-xs font-medium text-muted">avg optimal white-cross length</p>
            <p className="max-w-sm text-[11px] text-muted-2">over your last {r.current.scrambles} scrambles</p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Every color, shortest first</SectionTitle>
            {(() => {
              const max = Math.max(...r.all.map((s) => s.avgLen));
              return r.all.map((s) => (
                <div key={s.face} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-border-strong"
                    style={{ background: COLOR_SWATCH[s.colorName] ?? "var(--accent)" }}
                  />
                  <span className="w-14 shrink-0 capitalize text-foreground/90">{s.colorName}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
                    <div className="absolute inset-y-0 left-0 rounded bg-accent/60" style={{ width: `${max > 0 ? (s.avgLen / max) * 100 : 0}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums text-muted-2">{s.avgLen.toFixed(2)}</span>
                  {s.face === "U" && <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent">used</span>}
                </div>
              ));
            })()}
            <p className="text-[10px] text-muted-2">
              Each bar is the average optimal cross length on those same scrambles, rotated so that color starts up — a lookup, not a real search per solve.
            </p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
