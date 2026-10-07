/**
 * The pure half of haptics: which levels exist, what each moment of a solve
 * feels like, how a stored preference is read, and the rate limiter that keeps
 * a fast solve from becoming one long buzz. Nothing here touches the browser.
 */

export const HAPTIC_LEVELS = ["off", "light", "full"] as const;
export type HapticsLevel = (typeof HAPTIC_LEVELS)[number];

/** Finish, PB and phase boundaries buzz by default; the per-turn tick is opt-in ("full"). */
export const DEFAULT_HAPTICS_LEVEL: HapticsLevel = "light";

/** localStorage key of the preference object (its own, so the settings store stays untouched). */
export const HAPTICS_STORAGE_KEY = "cube-timer-haptics";

export const HAPTIC_LEVEL_INFO: Record<HapticsLevel, { label: string; hint: string }> = {
  off: { label: "Off", hint: "No vibration at all." },
  light: { label: "Light", hint: "A short buzz at each phase boundary, a longer one when you finish, and a flourish for a personal best." },
  full: { label: "Full", hint: "Light, plus a faint tick for every turn your smart cube reports during a solve." },
};

export type HapticKind =
  | "turn"
  | "pair"
  | "phase"
  | "finish"
  | "pb"
  | "pbAverage"
  | "achievement"
  | "ready";

export type HapticPattern = number | number[];

/** What each moment feels like, in ms (odd entries are pauses, as navigator.vibrate reads them). */
export const HAPTIC_PATTERNS: Record<HapticKind, HapticPattern> = {
  turn: 8,
  pair: 14,
  phase: [20, 50, 20],
  finish: [60, 40, 60, 40, 120],
  pb: [40, 60, 80],
  pbAverage: 50,
  achievement: [30, 40, 30, 40, 60],
  ready: 10,
};

/** The lowest level at which a kind of haptic plays: "light" covers everything except the per-turn tick. */
export function minLevelFor(kind: HapticKind): Exclude<HapticsLevel, "off"> {
  return kind === "turn" ? "full" : "light";
}

const RANK: Record<HapticsLevel, number> = { off: 0, light: 1, full: 2 };

export function levelAllows(level: HapticsLevel, kind: HapticKind): boolean {
  return RANK[level] >= RANK[minLevelFor(kind)];
}

/** Total length of a pattern, so a following tick can wait for it to finish. */
export function patternDurationMs(pattern: HapticPattern): number {
  return typeof pattern === "number" ? pattern : pattern.reduce((a, b) => a + b, 0);
}

/** A stored preference object (or anything else) to a level; unknown or corrupt values fall back to the default. */
export function parseHapticsPref(raw: unknown): HapticsLevel {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return DEFAULT_HAPTICS_LEVEL;
    }
  }
  if (value && typeof value === "object" && "level" in value) {
    const level = (value as { level: unknown }).level;
    if (typeof level === "string" && (HAPTIC_LEVELS as readonly string[]).includes(level)) return level as HapticsLevel;
  }
  return DEFAULT_HAPTICS_LEVEL;
}

export function serializeHapticsPref(level: HapticsLevel): string {
  return JSON.stringify({ v: 1, level });
}

/** A turn tick at most this often: 10 turns a second must read as a patter, not a drone. */
export const TURN_TICK_MIN_GAP_MS = 60;

export interface TickLimiter {
  /** True (and remembers it) when a tick may play at `nowMs`. */
  allow(nowMs: number): boolean;
  /** Keeps ticks quiet until `untilMs`, e.g. while a phase or finish pattern is still playing (a new vibrate() cuts the old one short). */
  hold(untilMs: number): void;
  reset(): void;
}

export function createTickLimiter(minGapMs: number = TURN_TICK_MIN_GAP_MS): TickLimiter {
  let nextAt = -Infinity;
  return {
    allow(nowMs) {
      if (nowMs < nextAt) return false;
      nextAt = nowMs + minGapMs;
      return true;
    },
    hold(untilMs) {
      if (untilMs > nextAt) nextAt = untilMs;
    },
    reset() {
      nextAt = -Infinity;
    },
  };
}

/** The slice of the smart-cube store that decides a haptic, so it can be tested without the store. */
export interface SolveProgress {
  recording: boolean;
  startedAtMs: number | null;
  solvedAtMs: number | null;
  crossAtMs: number | null;
  f2lAtMs: number | null;
  ollAtMs: number | null;
  f2lPairAtMs: (number | null)[];
}

const pairsDone = (p: SolveProgress) => {
  let n = 0;
  for (const t of p.f2lPairAtMs) if (t !== null) n++;
  return n;
};

/**
 * What changed between two store states, as a haptic: finish beats a phase
 * boundary (cross, F2L done, OLL), which beats a single F2L pair. Only a solve
 * being played counts: a milestone that appears while nothing is recording
 * (a repaired solve adopted afterwards) stays silent, and so does anything
 * being reset to null at the start of an attempt.
 */
export function solveHapticFor(prev: SolveProgress, next: SolveProgress): HapticKind | null {
  if (next === prev) return null;
  if (!prev.recording && !next.recording) return null;
  if (prev.solvedAtMs === null && next.solvedAtMs !== null) return "finish";
  if (next.startedAtMs === null) return null;
  const reached = (a: number | null, b: number | null) => a === null && b !== null;
  if (reached(prev.crossAtMs, next.crossAtMs) || reached(prev.f2lAtMs, next.f2lAtMs) || reached(prev.ollAtMs, next.ollAtMs)) return "phase";
  if (next.f2lPairAtMs !== prev.f2lPairAtMs && pairsDone(next) > pairsDone(prev)) return "pair";
  return null;
}
