"use client";

import { useCallback, useMemo, useState } from "react";
import { Flame } from "lucide-react";
import type { Solve } from "@/types";
import { computeActivity } from "@/lib/stats/stats";
import { useNow } from "@/hooks/useNow";
import { buildHeatGrid, weeksThatFit } from "./chartMath";
import { useDismissOutside, useElementWidth } from "./chartKit";
import "@/styles/stats-charts.css";

const GAP = 3;
const CELL_MIN = 12;
const DAY_COL = 26;
const MONTH_H = 16;
const DAY_LABELS: Record<number, string> = { 0: "Mon", 2: "Wed", 4: "Fri" };

function levelFor(count: number): number {
  if (count === 0) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  if (count < 30) return 3;
  return 4;
}

// One hue, light to dark: the empty cell is a faint wash of ink, each level a stronger mix of the accent.
const LEVEL_COLOR = [
  "color-mix(in srgb, var(--foreground) 7%, var(--bg-panel))",
  "color-mix(in srgb, var(--accent) 36%, var(--bg-panel))",
  "color-mix(in srgb, var(--accent) 58%, var(--bg-panel))",
  "color-mix(in srgb, var(--accent) 80%, var(--bg-panel))",
  "var(--accent)",
];

interface Cell {
  date: string;
  count: number;
}

function cellText(cell: Cell): string {
  return `${cell.count} solve${cell.count === 1 ? "" : "s"} on ${cell.date}`;
}

/** "Tue 6 Oct" for the readout; the ISO date stays in the aria-label. */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function ActivityHeatmap({ solves }: { solves: Solve[] }) {
  const [hover, setHover] = useState<Cell | null>(null);
  const [setWrap, width, wrapEl] = useElementWidth(336);
  // Ticks, so the streak and the grid roll over at midnight without a reload.
  const now = useNow(60_000);
  const activity = useMemo(() => computeActivity(solves, now), [solves, now]);
  const dismiss = useCallback(() => setHover(null), []);
  useDismissOutside(wrapEl, hover !== null, dismiss);

  // As many weeks as fit, with the cells stretched to fill the width exactly.
  const avail = Math.max(120, width - DAY_COL);
  const weeks = weeksThatFit(avail, CELL_MIN, GAP, 12, 30);
  const cell = Math.max(CELL_MIN, Math.min(18, Math.floor((avail + GAP) / weeks - GAP)));
  const step = cell + GAP;
  const gridW = weeks * step - GAP;

  const grid = useMemo(() => buildHeatGrid(now, weeks), [now, weeks]);
  const total = useMemo(() => {
    let n = 0;
    for (const col of grid.columns) for (const c of col) if (c) n += activity.byDate.get(c.date) ?? 0;
    return n;
  }, [grid, activity]);

  if (solves.length === 0) {
    return <p className="py-4 text-sm text-muted-2">Your activity streak will show up here.</p>;
  }

  const months = grid.months.filter((m) => m.col * step + 30 <= gridW + 4);

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / step);
    const row = Math.floor((e.clientY - rect.top) / step);
    const c = grid.columns[col]?.[row];
    setHover(c ? { date: c.date, count: activity.byDate.get(c.date) ?? 0 } : null);
  };

  return (
    <div ref={setWrap}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flame size={15} className={activity.currentStreak > 0 ? "text-warning" : "text-muted-2"} />
          <span className="text-sm font-medium">
            {activity.currentStreak > 0 ? `${activity.currentStreak} day streak` : "No active streak"}
          </span>
        </div>
        <span className="text-xs text-muted-2">best {activity.longestStreak}d</span>
      </div>

      <div className="flex" style={{ gap: 0 }}>
        <div className="shrink-0 text-[11px] leading-none text-muted-2" style={{ width: DAY_COL, paddingTop: MONTH_H }} aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((r) => (
            <div key={r} style={{ height: cell, marginBottom: r < 6 ? GAP : 0 }} className="flex items-center">
              {DAY_LABELS[r]}
            </div>
          ))}
        </div>
        <div className="min-w-0" style={{ width: gridW }}>
          <div className="relative text-[11px] leading-none text-muted-2" style={{ height: MONTH_H }} aria-hidden>
            {months.map((m) => (
              <span key={`${m.col}-${m.label}`} className="absolute top-0 whitespace-nowrap" style={{ left: m.col * step }}>
                {m.label}
              </span>
            ))}
          </div>
          <div
            className="grid touch-pan-y select-none"
            style={{
              gridTemplateColumns: `repeat(${weeks}, ${cell}px)`,
              gridTemplateRows: `repeat(7, ${cell}px)`,
              gridAutoFlow: "column",
              gap: GAP,
            }}
            onPointerDown={pick}
            onPointerMove={(e) => {
              if (e.pointerType === "mouse" || e.buttons > 0 || e.pointerType === "touch") pick(e);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setHover(null);
            }}
          >
            {grid.columns.flatMap((col, c) =>
              col.map((d, r) => {
                if (!d) return <div key={`${c}-${r}`} aria-hidden />;
                const count = activity.byDate.get(d.date) ?? 0;
                const text = cellText({ date: d.date, count });
                const isHover = hover?.date === d.date;
                return (
                  <div
                    key={d.date}
                    role="img"
                    aria-label={text}
                    className="sc-fade"
                    style={{
                      borderRadius: 3,
                      background: LEVEL_COLOR[levelFor(count)],
                      outline: isHover ? "2px solid var(--foreground)" : d.ago === 0 ? "1.5px solid var(--muted)" : undefined,
                      outlineOffset: isHover ? 1 : -1,
                      ["--sc-delay" as string]: `${Math.min(500, c * 18)}ms`,
                    }}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-2">
        <p className="tabular-timer min-h-4 min-w-0 truncate">
          {hover ? (
            <>
              <span className="font-semibold text-foreground">{hover.count} solve{hover.count === 1 ? "" : "s"}</span> · {prettyDate(hover.date)}
            </>
          ) : (
            `${total} solve${total === 1 ? "" : "s"} in ${weeks} weeks`
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1" aria-hidden>
          <span className="mr-0.5">Less</span>
          {LEVEL_COLOR.map((c, i) => (
            <span key={i} className="block h-3 w-3" style={{ background: c, borderRadius: 3 }} />
          ))}
          <span className="ml-0.5">More</span>
        </div>
      </div>
    </div>
  );
}
