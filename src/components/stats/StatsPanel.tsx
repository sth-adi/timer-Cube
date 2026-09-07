"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeSessionStats } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-2">{label}</span>
      <span className="tabular-timer text-lg font-semibold text-foreground">{value}</span>
    </div>
  );
}

function fmt(ms: number | null): string {
  return ms === null ? "—" : formatTime(ms);
}

export function StatsPanel() {
  const solves = useSessionStore((s) => s.solves);
  const stats = useMemo(() => computeSessionStats(solves), [solves]);

  return (
    <div className="glass-panel rounded-2xl p-4 grid grid-cols-3 gap-4">
      <Stat label="ao5" value={fmt(stats.ao5)} />
      <Stat label="ao12" value={fmt(stats.ao12)} />
      <Stat label="ao100" value={fmt(stats.ao100)} />
      <Stat label="best" value={fmt(stats.best)} />
      <Stat label="mean" value={fmt(stats.mean)} />
      <Stat label="worst" value={fmt(stats.worst)} />
      <Stat label="solves" value={String(stats.count)} />
      <Stat label="best ao5" value={fmt(stats.bestAo5)} />
      <Stat label="best ao12" value={fmt(stats.bestAo12)} />
    </div>
  );
}
