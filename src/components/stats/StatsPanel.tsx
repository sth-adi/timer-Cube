"use client";

import { useMemo, useState } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeSessionStats, eventTagsPresent, normalSolves, solvesForEvent } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { EVENT_TAGS, type EventTag } from "@/types";
import { cn } from "@/lib/utils/cn";
import { SolveTrendChart } from "./SolveTrendChart";

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
  const rawSolves = useSessionStore((s) => s.solves);
  const [selected, setSelected] = useState<EventTag | null>(null);
  const presentTags = useMemo(() => eventTagsPresent(rawSolves), [rawSolves]);

  const solves = useMemo(
    () => (selected ? solvesForEvent(rawSolves, selected) : normalSolves(rawSolves)),
    [rawSolves, selected],
  );
  const stats = useMemo(() => computeSessionStats(solves), [solves]);

  return (
    <div className="card rounded-xl p-4">
      {presentTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-pressed={selected === null}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              selected === null ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
            )}
          >
            Normal
          </button>
          {presentTags.map((tag) => {
            const meta = EVENT_TAGS.find((t) => t.id === tag)!;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelected(tag)}
                aria-pressed={selected === tag}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  selected === tag ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
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
      {solves.length >= 2 && (
        <div className="mt-4 border-t border-border pt-3">
          <SolveTrendChart solves={solves} />
        </div>
      )}
    </div>
  );
}
