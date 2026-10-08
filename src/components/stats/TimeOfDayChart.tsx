"use client";

import { useCallback, useMemo, useState } from "react";
import type { Solve } from "@/types";
import { computeHourOfDay } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { slotIndex } from "./chartMath";
import { useDismissOutside, useSlotKeys } from "./chartKit";
import "@/styles/stats-charts.css";

// Collapse into 6 four-hour blocks — 24 individual bars is too noisy at this size.
const BLOCKS = [
  { label: "12–4a", hours: [0, 1, 2, 3] },
  { label: "4–8a", hours: [4, 5, 6, 7] },
  { label: "8–12p", hours: [8, 9, 10, 11] },
  { label: "12–4p", hours: [12, 13, 14, 15] },
  { label: "4–8p", hours: [16, 17, 18, 19] },
  { label: "8–12a", hours: [20, 21, 22, 23] },
];

const BAR_AREA = 84;
const BAR_MAX_W = 28;

export function TimeOfDayChart({ solves }: { solves: Solve[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const hourly = useMemo(() => computeHourOfDay(solves), [solves]);
  const dismiss = useCallback(() => setActive(null), []);
  useDismissOutside(el, active !== null, dismiss);

  const blocks = BLOCKS.map((b) => {
    let sum = 0;
    let count = 0;
    for (const h of b.hours) {
      const bucket = hourly[h];
      if (bucket.mean !== null) {
        sum += bucket.mean * bucket.count;
        count += bucket.count;
      }
    }
    return { ...b, mean: count > 0 ? sum / count : null, count };
  });

  const describe = (i: number) => {
    const b = blocks[i];
    return b.mean === null ? `${b.label}: no solves` : `${b.label}: ${formatTime(b.mean)} average over ${b.count} solve${b.count === 1 ? "" : "s"}`;
  };
  const keys = useSlotKeys(blocks.length, active, setActive, describe);

  const totalSolves = blocks.reduce((n, b) => n + b.count, 0);
  if (totalSolves < 3) {
    return <p className="py-4 text-sm text-muted-2">Solve at different times of day to see this.</p>;
  }

  const means = blocks.map((b) => b.mean).filter((m): m is number => m !== null);
  const best = Math.min(...means);
  const worst = Math.max(...means);
  const span = worst - best || 1;
  const bestBlock = blocks.find((b) => b.mean === best)!;
  const shown = active !== null ? blocks[active] : null;

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(slotIndex(e.clientX - rect.left, rect.width, blocks.length));
  };

  return (
    <div ref={setEl}>
      <div
        className="sc-focusable flex touch-pan-y select-none items-end border-b border-border-strong"
        role="group"
        tabIndex={0}
        aria-label={`Average solve time by time of day, quickest at ${bestBlock.label}. Use the arrow keys to step through the blocks.`}
        onKeyDown={keys.onKeyDown}
        onBlur={keys.onBlur}
        onPointerDown={(e) => {
          keys.onPointerDown();
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons > 0 || e.pointerType === "touch") pick(e);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setActive(null);
        }}
      >
        {blocks.map((b, i) => {
          const isBest = b.mean === best;
          const h = b.mean === null ? 2 : Math.round(BAR_AREA * (0.22 + (1 - (b.mean - best) / span) * 0.78));
          return (
            <div
              key={b.label}
              role="img"
              aria-label={b.mean === null ? `${b.label}: no solves` : `${b.label}: ${formatTime(b.mean)} average over ${b.count} solve${b.count === 1 ? "" : "s"}`}
              className="flex flex-1 flex-col items-center justify-end gap-1 px-px"
            >
              <span className={cn("tabular-timer text-[11px] leading-none", isBest ? "font-semibold text-foreground" : "text-muted-2")}>
                {b.mean === null ? "—" : formatTime(b.mean)}
              </span>
              {/* one series, one colour: the fastest block is the solid accent, the rest are the same hue stepped back */}
              <div
                className={cn("sc-bar sc-rise w-full rounded-t-[4px]", active !== null && active !== i && "sc-dim")}
                style={{
                  maxWidth: BAR_MAX_W,
                  height: h,
                  background: b.mean === null ? "var(--border-strong)" : isBest ? "var(--accent)" : "color-mix(in srgb, var(--accent) 62%, var(--bg-panel))",
                  ["--sc-delay" as string]: `${i * 40}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex">
        {blocks.map((b) => (
          <span key={b.label} className={cn("flex-1 whitespace-nowrap pt-1.5 text-center text-[11px]", b.mean === best ? "font-semibold text-foreground" : "text-muted-2")}>
            {b.label}
          </span>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {keys.announce}
      </span>
      <p className="tabular-timer mt-2 min-h-4 text-[11px] text-muted-2">
        {shown ? (
          shown.mean === null ? (
            `${shown.label}: no solves yet`
          ) : (
            <>
              <span className="whitespace-nowrap font-semibold text-foreground">{shown.label}</span> · {formatTime(shown.mean)} average · {shown.count} solve{shown.count === 1 ? "" : "s"}
            </>
          )
        ) : (
          <>
            Taller bar = faster · quickest at <span className="whitespace-nowrap font-medium text-foreground">{bestBlock.label}</span>
          </>
        )}
      </p>
    </div>
  );
}
