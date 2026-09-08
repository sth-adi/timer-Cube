"use client";

import { useMemo, useState } from "react";
import { Flame } from "lucide-react";
import type { Solve } from "@/types";
import { computeActivity } from "@/lib/stats/stats";

const WEEKS = 18;
const CELL = 11;
const GAP = 3;

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function levelFor(count: number): number {
  if (count === 0) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  if (count < 30) return 3;
  return 4;
}

const LEVEL_COLOR = ["var(--bg-panel-2)", "color-mix(in srgb, var(--accent) 30%, var(--bg-panel-2))", "color-mix(in srgb, var(--accent) 55%, var(--bg-panel-2))", "color-mix(in srgb, var(--accent) 78%, var(--bg-panel-2))", "var(--accent)"];

export function ActivityHeatmap({ solves }: { solves: Solve[] }) {
  const [hover, setHover] = useState<{ date: string; count: number } | null>(null);
  const activity = useMemo(() => computeActivity(solves), [solves]);

  const totalDays = WEEKS * 7;
  const cells = useMemo(() => {
    const list: { date: string; count: number }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const date = isoDateDaysAgo(i);
      list.push({ date, count: activity.byDate.get(date) ?? 0 });
    }
    return list;
  }, [activity, totalDays]);

  const columns = Math.ceil(cells.length / 7);

  if (solves.length === 0) {
    return <p className="text-muted-2 text-sm text-center py-6">Your activity streak will show up here.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flame size={15} className={activity.currentStreak > 0 ? "text-warning" : "text-muted-2"} />
          <span className="text-sm font-medium">
            {activity.currentStreak > 0 ? `${activity.currentStreak} day streak` : "No active streak"}
          </span>
        </div>
        <span className="text-xs text-muted-2">best {activity.longestStreak}d</span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${CELL}px)`,
            gridTemplateRows: `repeat(7, ${CELL}px)`,
            gridAutoFlow: "column",
            gap: `${GAP}px`,
          }}
          onMouseLeave={() => setHover(null)}
        >
          {cells.map((cell) => (
            <div
              key={cell.date}
              role="presentation"
              onMouseEnter={() => setHover(cell)}
              style={{
                width: CELL,
                height: CELL,
                borderRadius: 2,
                background: LEVEL_COLOR[levelFor(cell.count)],
              }}
            />
          ))}
        </div>
      </div>

      <p className="mt-2 h-4 text-[11px] text-muted-2">
        {hover ? `${hover.count} solve${hover.count === 1 ? "" : "s"} on ${hover.date}` : ""}
      </p>
    </div>
  );
}
