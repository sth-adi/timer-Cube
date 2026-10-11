/**
 * Pure parameter generation for the procedural speedcube sound. No Web Audio
 * in here: given a move token, a speed and a random source it returns plain
 * numbers describing one turn (a grip tick, a scrape while the layer moves,
 * and a snap with knock, thud and a settling tick when it lands). The engine
 * in cubeSounds.ts turns those numbers into nodes; keeping the numbers
 * separate makes the ranges testable without an audio device.
 */

export type TurnLayer = "face" | "wide" | "slice" | "rotation";

export interface TokenInfo {
  /** The base letter without modifiers, e.g. "R" for "R2'", "r" for "r". */
  base: string;
  layer: TurnLayer;
  /** Half turns scrape a little longer and land a little harder. */
  double: boolean;
}

export type Rng = () => number;

/** Small fast seeded PRNG (mulberry32): same seed, same sequence. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACES = "UDLRFB";
const SLICES = "MES";
const ROTATIONS = "xyz";

export function classifyToken(token: string): TokenInfo {
  const t = token.trim();
  const c = t.charAt(0);
  const double = t.includes("2");
  if (FACES.includes(c) && c !== "") {
    // Rw / Uw style wide turns.
    if (t.charAt(1) === "w") return { base: c.toLowerCase(), layer: "wide", double };
    return { base: c, layer: "face", double };
  }
  if (FACES.toLowerCase().includes(c) && c !== "") return { base: c, layer: "wide", double };
  if (SLICES.includes(c) && c !== "") return { base: c, layer: "slice", double };
  if (ROTATIONS.includes(c) && c !== "") return { base: c, layer: "rotation", double };
  // Unknown notation: treat as an ordinary face turn so something still plays.
  return { base: c || "U", layer: "face", double };
}

/** Left/right placement by face; slight, so headphones get a hint, not a ping-pong. */
const PAN_BY_FACE: Record<string, number> = {
  L: -0.3,
  R: 0.3,
  B: 0.12,
  U: 0.05,
  D: -0.05,
  F: 0,
  M: -0.05,
  E: 0.04,
  S: 0.02,
  x: 0.1,
  y: -0.1,
  z: 0,
};

export function panForToken(info: TokenInfo): number {
  return PAN_BY_FACE[info.base] ?? PAN_BY_FACE[info.base.toUpperCase()] ?? 0;
}

export interface Resonator {
  freq: number;
  /** Time constant of the exponential decay, seconds. */
  decayS: number;
  gain: number;
}

export interface TurnParams {
  layer: TurnLayer;
  pan: number;
  /** 0..1 position of the turn speed on the soft-to-hard scale. */
  intensity: number;
  /** Seconds from the start of the turn to the snap that ends it. */
  snapDelayS: number;
  /** Quiet grab tick as the layer starts to move. */
  grab: { gain: number; durS: number; centerHz: number };
  /** The main snap. */
  click: { gain: number; durS: number; centerHz: number; q: number };
  knocks: Resonator[];
  thud: { freq: number; decayS: number; gain: number };
  /** Ratchet/scrape between grab and snap, only for turns slow enough to hear it. */
  scrape: { startS: number; durS: number; centerHz: number; gain: number; tickS: number } | null;
  /** A whoosh instead of a knock, for whole-cube rotations. */
  whoosh: { durS: number; fromHz: number; toHz: number; gain: number } | null;
  /** The settled tick shortly after the snap. */
  settle: { delayS: number; freq: number; decayS: number; gain: number };
  /** Playback-rate and gain jitter for the sample path. */
  sample: { rate: number; gain: number };
}

/** Turns per second at which a turn counts as "as fast as it gets". */
export const FAST_TPS = 7;
export const KNOCK_MIN_HZ = 900;
export const KNOCK_MAX_HZ = 3500;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Position of a speed in turns per second on the 0..1 soft-to-hard scale. */
export function intensityForSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return clamp(speed / FAST_TPS, 0, 1);
}

/** A fixed per-letter pitch offset (-6%..+6%) a faint per-face colour, kept tiny so no note can be heard. */
function faceVoice(base: string): number {
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return 0.98 + ((h % 13) / 12) * 0.04;
}

const LAYER_GAIN: Record<TurnLayer, number> = { face: 1, wide: 0.88, slice: 0.5, rotation: 0.32 };
const LAYER_PITCH: Record<TurnLayer, number> = { face: 1, wide: 0.92, slice: 0.7, rotation: 0.6 };

export function generateTurnParams(
  token: string,
  speed: number,
  durationMs: number,
  rng: Rng,
): TurnParams {
  const info = classifyToken(token);
  const s = intensityForSpeed(speed);
  const dur = clamp(Number.isFinite(durationMs) ? durationMs : 120, 20, 2000) / 1000;
  const layer = info.layer;
  // Fast turns are louder, sharper (higher centre frequencies) and shorter.
  const loud = lerp(0.3, 1, Math.pow(s, 0.8)) * LAYER_GAIN[layer] * lerp(0.9, 1.1, rng()) * (info.double ? 1.08 : 1);
  const bright = lerp(0.85, 1.2, s) * lerp(0.95, 1.05, rng());
  const pitch = LAYER_PITCH[layer] * faceVoice(info.base);
  const pan = clamp(panForToken(info) + (rng() - 0.5) * 0.08, -1, 1);

  const baseFreq = lerp(1150, 2100, rng()) * pitch * bright;
  const decayBase = lerp(0.007, 0.012, rng()) * lerp(1.15, 0.85, s);
  const ratios = [1, 1.58 + (rng() - 0.5) * 0.12, 2.37 + (rng() - 0.5) * 0.16];
  const weights = [1, 0.55, 0.3];
  const knocks: Resonator[] =
    layer === "rotation"
      ? []
      : ratios.map((r, i) => ({
          freq: clamp(baseFreq * r * lerp(0.98, 1.02, rng()), KNOCK_MIN_HZ, KNOCK_MAX_HZ),
          decayS: decayBase * (1 - i * 0.28),
          gain: 0.42 * loud * weights[i]!,
        }));

  const thudBase = layer === "slice" ? [120, 165] : layer === "rotation" ? [110, 150] : [150, 250];
  const thud = {
    freq: lerp(thudBase[0]!, thudBase[1]!, rng()),
    decayS: lerp(0.008, 0.012, rng()),
    gain: 0.18 * loud,
  };

  const clickDurS = lerp(0.006, 0.0025, s) * lerp(0.85, 1.15, rng());
  const click = {
    gain: (layer === "rotation" ? 0.05 : 0.3) * loud,
    durS: clamp(clickDurS, 0.002, 0.006),
    centerHz: 3200 * bright * pitch,
    q: 0.8,
  };
  const grab = { gain: 0.1 * loud, durS: lerp(0.003, 0.002, s), centerHz: 2600 * bright * pitch };

  // The scrape is only audible when the layer is visibly moving for a while.
  const scrape =
    layer !== "rotation" && dur >= 0.09
      ? {
          startS: 0.006,
          durS: Math.max(0.02, dur - 0.012),
          centerHz: lerp(2200, 4200, rng()) * pitch,
          gain: 0.045 * loud * Math.min(1, Math.sqrt(dur / 0.3)) * (info.double ? 1.3 : 1),
          tickS: lerp(0.006, 0.011, rng()),
        }
      : null;

  const whoosh =
    layer === "rotation"
      ? {
          durS: Math.max(0.06, dur),
          fromHz: lerp(500, 800, rng()),
          toHz: lerp(1400, 2200, rng()),
          gain: 0.16 * loud,
        }
      : null;

  const settle = {
    delayS: lerp(0.014, 0.026, rng()),
    freq: clamp(lerp(2800, 3800, rng()) * Math.min(1.15, pitch), KNOCK_MIN_HZ, KNOCK_MAX_HZ),
    decayS: 0.005,
    gain: (layer === "rotation" ? 0.04 : 0.12) * loud,
  };

  return {
    layer,
    pan,
    intensity: s,
    snapDelayS: dur,
    grab,
    click,
    knocks,
    thud,
    scrape,
    whoosh,
    settle,
    sample: { rate: lerp(0.94, 1.06, rng()) * lerp(0.96, 1.08, s), gain: clamp(lerp(0.45, 1, s) * LAYER_GAIN[layer] * lerp(0.9, 1.1, rng()), 0, 1) },
  };
}

/** Stackmat-style beep schedule: [offset seconds, duration seconds] pulses. */
export const START_BEEP = { freq: 1000, gain: 0.2, pulses: [[0, 0.07], [0.13, 0.07]] as const };
export const STOP_BEEP = { freq: 1000, gain: 0.2, pulses: [[0, 0.42]] as const };
