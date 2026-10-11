import type { PhaseMark } from "./replayTiming";

/**
 * The replay's "Director": a gentle camera nudge and a brief slow-motion dip around the key moments of a
 * solve (cross done, last F2L pair, start of OLL / PLL, a big recognition pause). Pure functions of the
 * timeline and the position, so scrubbing shows exactly what playing through does.
 */

export type MomentKind = "cross" | "f2l" | "oll" | "pll" | "pause";

export interface DirectorMoment {
  /** Replay-clock ms the moment is centred on. */
  atMs: number;
  kind: MomentKind;
  /** Camera nudge direction (+1 / -1), alternating so the camera does not drift one way. */
  dir: 1 | -1;
}

/** A recognition pause at least this long (replay-clock ms between a turn's end and the next one's start) is a moment. */
export const BIG_PAUSE_MS = 500;
const MAX_PAUSES = 3;
/** Moments closer than this are merged (the earlier wins). */
const MIN_SPACING_MS = 600;
/** The camera eases in over this long before a moment and out over the one after. */
export const LEAD_MS = 500;
export const TAIL_MS = 700;
/** The playback-rate dip lasts this long either side of the moment (about 400 ms in all) and bottoms out at this factor. */
export const DIP_HALF_MS = 200;
export const DIP_RATE = 0.6;
const YAW_DEG = 5;
const PITCH_DEG = 2.5;
const ZOOM = 0.05;

export function planMoments(args: {
  marks?: readonly PhaseMark[];
  starts: readonly number[];
  ends: readonly number[];
}): DirectorMoment[] {
  const { marks, starts, ends } = args;
  const n = Math.min(starts.length, ends.length);
  const raw: { atMs: number; kind: MomentKind }[] = [];
  if (marks && n > 0) {
    let prev = 0;
    for (const m of marks) {
      const label = m.label.toLowerCase();
      const end = Math.min(n, m.moveIndex);
      if (label === "cross" && end > 0) raw.push({ atMs: ends[end - 1], kind: "cross" });
      else if (label === "f2l" && end > 0) raw.push({ atMs: ends[end - 1], kind: "f2l" });
      else if ((label === "oll" || label === "pll") && prev < n) raw.push({ atMs: starts[prev], kind: label });
      prev = Math.max(prev, m.moveIndex);
    }
  }
  const pauses: { atMs: number; gap: number }[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const gap = starts[i + 1] - ends[i];
    if (gap >= BIG_PAUSE_MS) pauses.push({ atMs: starts[i + 1], gap });
  }
  pauses.sort((a, b) => b.gap - a.gap);
  for (const p of pauses.slice(0, MAX_PAUSES)) raw.push({ atMs: p.atMs, kind: "pause" });
  raw.sort((a, b) => a.atMs - b.atMs);
  const out: DirectorMoment[] = [];
  for (const r of raw) {
    if (out.length && r.atMs - out[out.length - 1].atMs < MIN_SPACING_MS) continue;
    out.push({ ...r, dir: out.length % 2 === 0 ? 1 : -1 });
  }
  return out;
}

export interface DirectorFrame {
  /** Degrees to add to the viewer's orbit. */
  yaw: number;
  pitch: number;
  /** Scale of the cube (1 = none). */
  zoom: number;
  /** Multiplier for the playback rate (1 = normal). */
  rate: number;
}

export const NO_DIRECTION: DirectorFrame = { yaw: 0, pitch: 0, zoom: 1, rate: 1 };

/** The camera and the rate at replay position `pos`. */
export function directorAt(moments: readonly DirectorMoment[], pos: number): DirectorFrame {
  let env = 0;
  let dir = 1;
  let rate = 1;
  for (const m of moments) {
    const d = pos - m.atMs;
    if (d < -LEAD_MS || d > TAIL_MS) continue;
    // Ease in and out: sin^2 over the whole window, peaking at the moment's side of the lead.
    const t = (d + LEAD_MS) / (LEAD_MS + TAIL_MS);
    const e = Math.sin(Math.PI * t) ** 2;
    if (e > env) {
      env = e;
      dir = m.dir;
    }
    if (Math.abs(d) < DIP_HALF_MS) {
      const r = 1 - (1 - DIP_RATE) * (0.5 + 0.5 * Math.cos((Math.PI * d) / DIP_HALF_MS));
      if (r < rate) rate = r;
    }
  }
  if (env === 0 && rate === 1) return NO_DIRECTION;
  return { yaw: dir * YAW_DEG * env, pitch: -PITCH_DEG * env, zoom: 1 + ZOOM * env, rate };
}
