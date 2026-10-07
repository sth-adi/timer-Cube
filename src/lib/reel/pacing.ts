import type { ReelPhase } from "./timeline";

/**
 * The pacing bar along the bottom of a Solve Reel: the solve as four
 * coloured stretches — Cross, F2L, OLL, PLL — as wide as they took (with a
 * floor so a short one still fits its label), and a playhead that moves
 * through them. Pure geometry; the renderer only draws what this says.
 */

export type PacingKey = "cross" | "f2l" | "oll" | "pll" | "solve";

export interface PacingSegment {
  key: PacingKey;
  /** Short name drawn under the bar ("Cross", "F2L", "OLL", "PLL"). */
  label: string;
  /** The case this stretch landed on, when it has one ("Sune", "T Perm"). */
  detail: string;
  /** Which of the four phase hues (0 cross, 1 F2L, 2 OLL, 3 PLL). */
  hue: number;
  startMs: number;
  endMs: number;
  /** Times inside the stretch where an F2L pair landed — drawn as small ticks. */
  ticks: number[];
}

export interface PacingSlot {
  x: number;
  w: number;
}

const HUE: Record<PacingKey, number> = { cross: 0, f2l: 1, oll: 2, pll: 3, solve: 1 };

function keyOf(label: string): PacingKey {
  if (label.startsWith("Cross")) return "cross";
  if (label.startsWith("F2L")) return "f2l";
  if (label.startsWith("OLL")) return "oll";
  if (label.startsWith("PLL")) return "pll";
  return "solve";
}

/** Folds the timeline's phases (Cross, F2L 1-4, OLL, PLL) into the bar's stretches. Always covers 0 .. totalMs. */
export function pacingSegments(phases: readonly ReelPhase[], totalMs: number): PacingSegment[] {
  const out: PacingSegment[] = [];
  let at = 0;
  for (const p of phases) {
    const key = keyOf(p.label);
    const end = Math.max(at, p.endMs);
    const last = out[out.length - 1];
    if (last && last.key === key) {
      if (key === "f2l") last.ticks.push(last.endMs);
      last.endMs = end;
    } else {
      const detail = p.label.includes(" · ") ? p.label.split(" · ").slice(1).join(" · ") : p.label.endsWith("skip") ? "skip" : "";
      out.push({ key, label: key === "solve" ? "Solve" : key === "cross" ? "Cross" : key.toUpperCase(), detail, hue: HUE[key], startMs: at, endMs: end, ticks: [] });
    }
    at = end;
  }
  if (out.length === 0) return [{ key: "solve", label: "Solve", detail: "", hue: 1, startMs: 0, endMs: Math.max(1, totalMs), ticks: [] }];
  // Anything after the last detected milestone is still part of the solve.
  if (totalMs > at + 1) out.push({ key: "solve", label: "Finish", detail: "", hue: (out[out.length - 1].hue + 1) % 4, startMs: at, endMs: totalMs, ticks: [] });
  else out[out.length - 1].endMs = Math.max(out[out.length - 1].endMs, totalMs);
  return out;
}

/** Where each stretch sits across `width` px: proportional to its time, but never narrower than `minW`. */
export function layoutPacing(segs: readonly PacingSegment[], width: number, gap: number, minW: number): PacingSlot[] {
  const n = segs.length;
  const free = Math.max(0, width - gap * (n - 1) - minW * n);
  const total = segs.reduce((s, g) => s + Math.max(0, g.endMs - g.startMs), 0) || 1;
  const slots: PacingSlot[] = [];
  let x = 0;
  for (const g of segs) {
    const w = minW + (free * Math.max(0, g.endMs - g.startMs)) / total;
    slots.push({ x, w });
    x += w + gap;
  }
  return slots;
}

/** The playhead's x (relative to the bar's left edge) at solve time `t`: linear inside a stretch, jumping the gap between two. */
export function playheadX(segs: readonly PacingSegment[], slots: readonly PacingSlot[], t: number): number {
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (t <= g.endMs || i === segs.length - 1) {
      const span = g.endMs - g.startMs;
      const f = span > 0 ? Math.min(1, Math.max(0, (t - g.startMs) / span)) : t >= g.endMs ? 1 : 0;
      return slots[i].x + slots[i].w * f;
    }
  }
  return 0;
}

/** Which stretch `t` falls in (the last one once the solve is over). */
export function pacingIndexAt(segs: readonly PacingSegment[], t: number): number {
  for (let i = 0; i < segs.length; i++) if (t < segs[i].endMs) return i;
  return segs.length - 1;
}
