import type { Solve } from "@/types";
import { solveFinalMs } from "@/types";

export interface AverageResult {
  /** ms, or null if DNF (too many DNFs in the window) or not enough solves yet. */
  value: number | null;
  isDnf: boolean;
}

/**
 * WCA-style average of N: drop the best and worst 1 result (for N>=5), mean
 * the rest. If more than 1 DNF is in the window, or N=1..2 has any DNF, the
 * average itself is DNF. For N<5 there's no trimming (plain mean), matching
 * how most community timers define ao3.
 */
export function averageOfN(times: number[]): AverageResult {
  const n = times.length;
  if (n === 0) return { value: null, isDnf: false };

  if (n < 5) {
    const dnfCount = times.filter((t) => t === Infinity).length;
    if (dnfCount > 0) return { value: null, isDnf: true };
    const mean = times.reduce((a, b) => a + b, 0) / n;
    return { value: mean, isDnf: false };
  }

  const dnfCount = times.filter((t) => t === Infinity).length;
  if (dnfCount >= 2) return { value: null, isDnf: true };

  const sorted = [...times].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);
  if (trimmed.some((t) => t === Infinity)) return { value: null, isDnf: true };
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  return { value: mean, isDnf: false };
}

/** Maps a solve to its comparable time: DNF -> Infinity, else final (with +2) ms. */
export function comparableTime(solve: Solve): number {
  const final = solveFinalMs(solve);
  return final === null ? Infinity : final;
}

/**
 * Rolling average-of-N ending at each solve (chronological order in, same
 * length out). Entry i is null until at least N solves have occurred.
 */
export function rollingAverages(solves: Solve[], n: number): (number | null)[] {
  const times = solves.map(comparableTime);
  const result: (number | null)[] = [];
  for (let i = 0; i < times.length; i++) {
    if (i + 1 < n) {
      result.push(null);
      continue;
    }
    const window = times.slice(i + 1 - n, i + 1);
    result.push(averageOfN(window).value);
  }
  return result;
}

/** Best rolling average-of-N across the whole session (the "best aoN" stat). */
export function bestAverageOfN(solves: Solve[], n: number): number | null {
  const rolling = rollingAverages(solves, n);
  const valid = rolling.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

export interface SessionStats {
  count: number;
  solveCount: number;
  dnfCount: number;
  best: number | null;
  worst: number | null;
  mean: number | null;
  ao5: number | null;
  ao12: number | null;
  ao50: number | null;
  ao100: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  stdDev: number | null;
}

export interface DayActivity {
  /** YYYY-MM-DD in the viewer's local timezone. */
  date: string;
  count: number;
}

export interface ActivitySummary {
  /** One entry per day with at least one solve, oldest first. */
  days: DayActivity[];
  /** Lookup from YYYY-MM-DD to solve count, for calendar rendering. */
  byDate: Map<string, number>;
  currentStreak: number;
  longestStreak: number;
}

function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Groups solves by local calendar day and derives streak info (consecutive
 * days with at least one solve). "Current streak" counts backward from
 * today or yesterday — a day missed further back doesn't retroactively
 * break it, but a gap since yesterday does.
 */
export function computeActivity(solves: Solve[]): ActivitySummary {
  const byDate = new Map<string, number>();
  for (const solve of solves) {
    const key = dayKey(solve.date);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }

  const days = [...byDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const oneDayMs = 24 * 60 * 60 * 1000;
  let longestStreak = 0;
  let running = 0;
  let prevDayNum: number | null = null;
  for (const { date } of days) {
    const dayNum = Math.floor(new Date(`${date}T00:00:00`).getTime() / oneDayMs);
    if (prevDayNum !== null && dayNum === prevDayNum + 1) {
      running += 1;
    } else {
      running = 1;
    }
    longestStreak = Math.max(longestStreak, running);
    prevDayNum = dayNum;
  }

  let currentStreak = 0;
  if (days.length > 0) {
    const todayNum = Math.floor(Date.now() / oneDayMs);
    const lastDayNum = Math.floor(new Date(`${days[days.length - 1].date}T00:00:00`).getTime() / oneDayMs);
    if (lastDayNum === todayNum || lastDayNum === todayNum - 1) {
      currentStreak = 1;
      for (let i = days.length - 1; i > 0; i--) {
        const cur = Math.floor(new Date(`${days[i].date}T00:00:00`).getTime() / oneDayMs);
        const prev = Math.floor(new Date(`${days[i - 1].date}T00:00:00`).getTime() / oneDayMs);
        if (cur === prev + 1) currentStreak += 1;
        else break;
      }
    }
  }

  return { days, byDate, currentStreak, longestStreak };
}

export interface HistogramBucket {
  /** Bucket lower bound, ms. */
  from: number;
  /** Bucket upper bound (exclusive), ms. */
  to: number;
  count: number;
}

/** Buckets finite solve times into `bucketCount` equal-width bins for a distribution histogram. */
export function computeHistogram(solves: Solve[], bucketCount = 12): HistogramBucket[] {
  const times = solves.map(comparableTime).filter((t) => Number.isFinite(t));
  if (times.length === 0) return [];
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = max - min || 1;
  const width = span / bucketCount;

  const buckets: HistogramBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }));
  for (const t of times) {
    const idx = Math.min(bucketCount - 1, Math.floor((t - min) / width));
    buckets[idx].count += 1;
  }
  return buckets;
}

export interface HourBucket {
  hour: number; // 0-23, local time
  count: number;
  mean: number | null;
}

/** Average solve time grouped by hour-of-day (local time), for a "when am I fastest" view. */
export function computeHourOfDay(solves: Solve[]): HourBucket[] {
  const sums = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (const solve of solves) {
    const t = comparableTime(solve);
    if (!Number.isFinite(t)) continue;
    const hour = new Date(solve.date).getHours();
    sums[hour] += t;
    counts[hour] += 1;
  }
  return sums.map((sum, hour) => ({
    hour,
    count: counts[hour],
    mean: counts[hour] > 0 ? sum / counts[hour] : null,
  }));
}

export interface PBMoment {
  solveId: string;
  date: number;
  ms: number;
  solveIndex: number; // 1-based position in the session
}

/** Every solve that, at the time it was recorded, was a new session-best single. */
export function computePBHistory(solves: Solve[]): PBMoment[] {
  const history: PBMoment[] = [];
  let best = Infinity;
  solves.forEach((solve, i) => {
    const t = comparableTime(solve);
    if (t < best) {
      best = t;
      history.push({ solveId: solve.id, date: solve.date, ms: t, solveIndex: i + 1 });
    }
  });
  return history;
}

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  /** "max": unlocked once current >= target (counts, streaks). "min": unlocked once current <= target (times — lower is better). */
  direction: "max" | "min";
  target: number;
  current: (ctx: AchievementContext) => number;
  /** Formats `current` for display in a progress readout, e.g. "42 / 100" or "12.3s". */
  formatCurrent?: (current: number) => string;
  formatTarget?: (target: number) => string;
}

export interface AchievementContext {
  solves: Solve[];
  finiteTimes: number[];
  activity: ActivitySummary;
}

export interface AchievementState extends AchievementDef {
  unlocked: boolean;
  currentValue: number;
}

const countFmt = (n: number) => String(n);
const secFmt = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : "—");
const dayFmt = (n: number) => `${n}d`;

function hourRangeSolved(solves: Solve[], startHour: number, endHour: number): boolean {
  return solves.some((s) => {
    const h = new Date(s.date).getHours();
    return h >= startHour && h < endHour;
  });
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-solve",
    label: "First Steps",
    description: "Complete your first solve",
    icon: "🎬",
    direction: "max",
    target: 1,
    current: (c) => c.solves.length,
    formatCurrent: countFmt,
    formatTarget: countFmt,
  },
  {
    id: "solves-10",
    label: "Getting Warmed Up",
    description: "Complete 10 solves",
    icon: "🔥",
    direction: "max",
    target: 10,
    current: (c) => c.solves.length,
    formatCurrent: countFmt,
    formatTarget: countFmt,
  },
  {
    id: "solves-100",
    label: "Centurion",
    description: "Complete 100 solves",
    icon: "💯",
    direction: "max",
    target: 100,
    current: (c) => c.solves.length,
    formatCurrent: countFmt,
    formatTarget: countFmt,
  },
  {
    id: "solves-500",
    label: "The Grind",
    description: "Complete 500 solves",
    icon: "⚙️",
    direction: "max",
    target: 500,
    current: (c) => c.solves.length,
    formatCurrent: countFmt,
    formatTarget: countFmt,
  },
  {
    id: "solves-1000",
    label: "Solve Master",
    description: "Complete 1,000 solves",
    icon: "🏅",
    direction: "max",
    target: 1000,
    current: (c) => c.solves.length,
    formatCurrent: countFmt,
    formatTarget: countFmt,
  },
  {
    id: "sub-30",
    label: "Sub-30",
    description: "Get a single solve under 30 seconds",
    icon: "🐢",
    direction: "min",
    target: 30000,
    current: (c) => (c.finiteTimes.length ? Math.min(...c.finiteTimes) : Infinity),
    formatCurrent: secFmt,
    formatTarget: secFmt,
  },
  {
    id: "sub-20",
    label: "Sub-20",
    description: "Get a single solve under 20 seconds",
    icon: "🚗",
    direction: "min",
    target: 20000,
    current: (c) => (c.finiteTimes.length ? Math.min(...c.finiteTimes) : Infinity),
    formatCurrent: secFmt,
    formatTarget: secFmt,
  },
  {
    id: "sub-15",
    label: "Sub-15",
    description: "Get a single solve under 15 seconds",
    icon: "🏍️",
    direction: "min",
    target: 15000,
    current: (c) => (c.finiteTimes.length ? Math.min(...c.finiteTimes) : Infinity),
    formatCurrent: secFmt,
    formatTarget: secFmt,
  },
  {
    id: "sub-10",
    label: "Sub-10",
    description: "Get a single solve under 10 seconds",
    icon: "🚀",
    direction: "min",
    target: 10000,
    current: (c) => (c.finiteTimes.length ? Math.min(...c.finiteTimes) : Infinity),
    formatCurrent: secFmt,
    formatTarget: secFmt,
  },
  {
    id: "streak-3",
    label: "On a Roll",
    description: "Solve on 3 days in a row",
    icon: "📆",
    direction: "max",
    target: 3,
    current: (c) => c.activity.longestStreak,
    formatCurrent: dayFmt,
    formatTarget: dayFmt,
  },
  {
    id: "streak-7",
    label: "Committed",
    description: "Solve on 7 days in a row",
    icon: "🗓️",
    direction: "max",
    target: 7,
    current: (c) => c.activity.longestStreak,
    formatCurrent: dayFmt,
    formatTarget: dayFmt,
  },
  {
    id: "streak-30",
    label: "Unstoppable",
    description: "Solve on 30 days in a row",
    icon: "🌟",
    direction: "max",
    target: 30,
    current: (c) => c.activity.longestStreak,
    formatCurrent: dayFmt,
    formatTarget: dayFmt,
  },
  {
    id: "night-owl",
    label: "Night Owl",
    description: "Solve between midnight and 4am",
    icon: "🦉",
    direction: "max",
    target: 1,
    current: (c) => (hourRangeSolved(c.solves, 0, 4) ? 1 : 0),
    formatCurrent: () => "",
    formatTarget: () => "",
  },
  {
    id: "early-bird",
    label: "Early Bird",
    description: "Solve between 4am and 7am",
    icon: "🐦",
    direction: "max",
    target: 1,
    current: (c) => (hourRangeSolved(c.solves, 4, 7) ? 1 : 0),
    formatCurrent: () => "",
    formatTarget: () => "",
  },
];

/** Evaluates every achievement definition against the given (typically lifetime, cross-session) solve history. */
export function computeAchievements(solves: Solve[]): AchievementState[] {
  const finiteTimes = solves.map(comparableTime).filter((t) => Number.isFinite(t));
  const activity = computeActivity(solves);
  const ctx: AchievementContext = { solves, finiteTimes, activity };

  return ACHIEVEMENTS.map((def) => {
    const currentValue = def.current(ctx);
    const unlocked = def.direction === "max" ? currentValue >= def.target : currentValue <= def.target;
    return { ...def, currentValue, unlocked };
  });
}

export function computeSessionStats(solves: Solve[]): SessionStats {
  const times = solves.map(comparableTime);
  const finite = times.filter((t) => Number.isFinite(t));
  const dnfCount = times.length - finite.length;

  const best = finite.length > 0 ? Math.min(...finite) : null;
  const worst = finite.length > 0 ? Math.max(...finite) : null;
  const mean = finite.length > 0 ? finite.reduce((a, b) => a + b, 0) / finite.length : null;

  let stdDev: number | null = null;
  if (finite.length > 1 && mean !== null) {
    const variance = finite.reduce((sum, t) => sum + (t - mean) ** 2, 0) / (finite.length - 1);
    stdDev = Math.sqrt(variance);
  }

  const last = (n: number) => averageOfN(times.slice(-n)).value;

  return {
    count: solves.length,
    solveCount: finite.length,
    dnfCount,
    best,
    worst,
    mean,
    ao5: times.length >= 5 ? last(5) : null,
    ao12: times.length >= 12 ? last(12) : null,
    ao50: times.length >= 50 ? last(50) : null,
    ao100: times.length >= 100 ? last(100) : null,
    bestAo5: bestAverageOfN(solves, 5),
    bestAo12: bestAverageOfN(solves, 12),
    stdDev,
  };
}
