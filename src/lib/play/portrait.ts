/**
 * Solve Portraits: every solve drawn as its own piece of generative art.
 *
 * A pen walks the canvas once per turn. Which face you turned decides how
 * far it swings (each face its own angle, counter-clockwise swings the
 * other way, a double turn swings twice), and *how long you took* decides
 * how far it walks — a burst of fast turns curls into a tight knot, a
 * pause to look shoots out a long straight stroke. The solve's phases set
 * the ink, so the cross, F2L, OLL and PLL are each their own color. No two
 * solves draw the same; the same solve always draws the same.
 */

export interface PortraitSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0 cross, 1 F2L, 2 OLL, 3 PLL. */
  phase: number;
  /** Stroke weight, heavier after a pause. */
  w: number;
  /** 0..1 through the solve — for draw-on animation. */
  t: number;
}

export interface Portrait {
  segs: PortraitSeg[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

/** Degrees each face swings the pen, clockwise; distinct so every face leaves its own signature. */
export const TURN_DEG: Record<string, number> = { U: 72, D: -72, R: 26, L: -26, F: 151, B: -151, M: 90, E: -90, S: 45 };

function amount(token: string): number {
  if (token.includes("2")) return 2;
  return token.includes("'") ? -1 : 1;
}

/** How far the pen walks for a turn that came `gapMs` after the last one. */
export function strokeLength(gapMs: number): number {
  return 3 + Math.sqrt(Math.max(0, Math.min(gapMs, 4000))) * 0.85;
}

/**
 * @param phaseEnds Ms from start at which cross, F2L and OLL ended (from
 *   the solve's metrics). Without them the whole portrait is one phase.
 */
export function portrait(moves: readonly string[], timesMs: readonly number[], phaseEnds: readonly number[] = []): Portrait {
  let x = 0;
  let y = 0;
  let heading = -90;
  const segs: PortraitSeg[] = [];
  let x0 = 0;
  let y0 = 0;
  let x1 = 0;
  let y1 = 0;
  const end = timesMs[timesMs.length - 1] || 1;
  for (let i = 0; i < moves.length; i++) {
    const token = moves[i];
    heading += (TURN_DEG[token[0]] ?? 0) * amount(token);
    const gap = i === 0 ? 0 : (timesMs[i] ?? 0) - (timesMs[i - 1] ?? 0);
    const len = strokeLength(gap);
    const rad = (heading * Math.PI) / 180;
    const nx = x + Math.cos(rad) * len;
    const ny = y + Math.sin(rad) * len;
    const at = timesMs[i] ?? 0;
    let phase = phaseEnds.findIndex((e) => at <= e);
    if (phase < 0) phase = phaseEnds.length ? Math.min(3, phaseEnds.length) : 0;
    segs.push({ x1: x, y1: y, x2: nx, y2: ny, phase, w: 1 + Math.min(1, gap / 500) * 2.2, t: at / end });
    x = nx;
    y = ny;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { segs, bounds: { x0, y0, x1, y1 } };
}

/** Fits a portrait's bounds into a width×height canvas with padding, keeping its aspect. */
export function fitTransform(bounds: Portrait["bounds"], width: number, height: number, pad = 0.08) {
  const bw = Math.max(1, bounds.x1 - bounds.x0);
  const bh = Math.max(1, bounds.y1 - bounds.y0);
  const scale = Math.min((width * (1 - 2 * pad)) / bw, (height * (1 - 2 * pad)) / bh);
  const ox = (width - bw * scale) / 2 - bounds.x0 * scale;
  const oy = (height - bh * scale) / 2 - bounds.y0 * scale;
  return { scale, ox, oy };
}

/** Ink per phase: cross, F2L, OLL, PLL. */
export const PHASE_INK = ["#38e1ff", "#b36bff", "#ffb13b", "#3dffa8"] as const;
