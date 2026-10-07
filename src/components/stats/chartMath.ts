/** Pure geometry/format helpers shared by the stats charts (kept out of the components so they can be unit-tested). */

const SECOND_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** Round, evenly spaced y-ticks (in ms) for an axis spanning [min, max] ms — about `target` of them, on whole-second-ish steps. */
export function niceTicks(min: number, max: number, target = 4): { ticks: number[]; stepMs: number } {
  const span = Math.max(1, max - min);
  const raw = span / 1000 / Math.max(1, target);
  const stepS = SECOND_STEPS.find((s) => s >= raw) ?? SECOND_STEPS[SECOND_STEPS.length - 1];
  const stepMs = stepS * 1000;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / stepMs) * stepMs; t <= max + 1e-6; t += stepMs) ticks.push(Math.round(t));
  return { ticks, stepMs };
}

/** An axis label: "9", "9.5", "1:05" — no unit clutter; the chart's caption says seconds. */
export function formatAxisTime(ms: number, stepMs: number): string {
  if (ms >= 60_000) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  const s = ms / 1000;
  return stepMs < 1000 ? s.toFixed(1) : String(Math.round(s));
}

/** The data index (0..count-1) a pointer at `px` (px from the plot's left edge) is nearest to. */
export function nearestIndex(px: number, plotWidth: number, count: number): number {
  if (count <= 1 || plotWidth <= 0) return 0;
  const i = Math.round((px / plotWidth) * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}

/** The bucket (0..count-1) a pointer at `px` falls in when `count` equal slots share `width`. */
export function slotIndex(px: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((px / width) * count)));
}

/** Left offset for a fixed-width readout centred on x but kept inside [0, width]. */
export function clampReadout(x: number, readoutWidth: number, width: number): number {
  return Math.max(0, Math.min(width - readoutWidth, x - readoutWidth / 2));
}

export interface HeatCell {
  date: string;
  /** Days before today. */
  ago: number;
}

export interface HeatGrid {
  /** columns[c][r]: r 0 = Monday … 6 = Sunday; null where the day is in the future. */
  columns: (HeatCell | null)[][];
  /** Month labels pinned to a column, never closer than `minGap` columns apart. */
  months: { col: number; label: string }[];
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A Monday-first week grid ending in the week that contains `now`, as many columns as fit. */
export function buildHeatGrid(now: number, weeks: number, minGap = 3): HeatGrid {
  const today = new Date(now);
  const dow = (today.getDay() + 6) % 7;
  const columns: (HeatCell | null)[][] = [];
  const firstOfMonth: { col: number; label: string }[] = [];
  for (let c = 0; c < weeks; c++) {
    const col: (HeatCell | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const ago = (weeks - 1 - c) * 7 + (dow - r);
      if (ago < 0) {
        col.push(null);
        continue;
      }
      const d = new Date(now);
      d.setDate(d.getDate() - ago);
      col.push({ date: isoDate(d), ago });
      if (d.getDate() === 1) firstOfMonth.push({ col: c, label: MONTHS[d.getMonth()] });
    }
    columns.push(col);
  }
  // The leftmost column names its month too, unless the next month starts right after it.
  const months: { col: number; label: string }[] = [];
  const first = columns[0]?.find((x) => x) ?? null;
  if (first && !firstOfMonth.some((m) => m.col < minGap)) {
    months.push({ col: 0, label: MONTHS[Number(first.date.slice(5, 7)) - 1] });
  }
  for (const m of firstOfMonth) {
    const last = months[months.length - 1];
    if (!last || m.col - last.col >= minGap) months.push(m);
  }
  return { columns, months };
}

/** How many 7-day columns of `cell`+`gap` px fit in `width` px, within sensible bounds. */
export function weeksThatFit(width: number, cell: number, gap: number, min = 12, max = 30): number {
  return Math.min(max, Math.max(min, Math.floor((width + gap) / (cell + gap))));
}
