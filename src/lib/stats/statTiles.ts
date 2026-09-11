/**
 * A big registry of small, single-number stats mined from the solves you've
 * already saved — no re-analysis, no worker, no waiting. Deliberately not
 * one polished chart per idea: each tile is a tiny pure function, so a huge
 * pile of genuinely distinct cuts through the same data stays reviewable and
 * correct instead of ballooning into 100 bespoke components. A tile that
 * doesn't have enough data returns null and simply doesn't render — see
 * StatTilesGrid.
 */

import type { EventTag, Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { formatTime } from "@/lib/utils/time";
import { averageTps, computeTpsBuckets, peakTps } from "@/lib/analysis/tps";
import { bestAverageOfN, comparableTime, computeActivity, computePBHistory, rollingAverages, solvesForEvent } from "./stats";

export interface StatTileResult {
  value: string;
  sub?: string;
}

export interface StatTileDef {
  id: string;
  category: string;
  label: string;
  /** `solves` is the current session's normal (2-handed) solves; `rawSolves` includes every penalty and event tag. Both chronological. */
  compute: (solves: Solve[], rawSolves: Solve[]) => StatTileResult | null;
}

const DAY_MS = 86_400_000;

function finalTimes(solves: readonly Solve[]): number[] {
  return solves.map((s) => solveFinalMs(s)).filter((t): t is number => t !== null);
}

function mean(xs: readonly number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function fmtHours(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}

function tokensOf(solve: Solve): string[] {
  return solve.reconstruction ? solve.reconstruction.trim().split(/\s+/).filter(Boolean) : [];
}

const FACE_LETTERS = ["U", "R", "F", "D", "L", "B"] as const;

function faceOfToken(token: string): (typeof FACE_LETTERS)[number] | null {
  const upper = token[0]?.toUpperCase();
  return (FACE_LETTERS as readonly string[]).includes(upper) ? (upper as (typeof FACE_LETTERS)[number]) : null;
}

function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A single solve's Cross/F2L/OLL/PLL duration (ms), or undefined if it doesn't have that phase's data. */
function phaseDurationOf(s: Solve, phase: 0 | 1 | 2 | 3): number | undefined {
  if (phase === 0) return s.crossMs;
  if (!s.splits || s.splits.length < 3) return undefined;
  const total = solveFinalMs(s);
  if (total === null) return undefined;
  if (phase === 1) return s.splits[1] - s.splits[0];
  if (phase === 2) return s.splits[2] - s.splits[1];
  return total - s.splits[2];
}

/** Cross/F2L/OLL/PLL durations (ms) mined straight from stored crossMs/splits, per solve. */
function phaseDurations(solves: readonly Solve[], phase: 0 | 1 | 2 | 3): number[] {
  const out: number[] = [];
  for (const s of solves) {
    const d = phaseDurationOf(s, phase);
    if (d !== undefined) out.push(d);
  }
  return out;
}

const tiles: StatTileDef[] = [];

// ---------- Speed ----------
tiles.push(
  {
    id: "best-single",
    category: "Speed",
    label: "Best single",
    compute: (solves) => {
      const times = finalTimes(solves);
      return times.length ? { value: formatTime(Math.min(...times)) } : null;
    },
  },
  {
    id: "worst-single",
    category: "Speed",
    label: "Worst single",
    compute: (solves) => {
      const times = finalTimes(solves);
      return times.length ? { value: formatTime(Math.max(...times)) } : null;
    },
  },
  {
    id: "mean-all",
    category: "Speed",
    label: "Mean",
    compute: (solves) => {
      const m = mean(finalTimes(solves));
      return m !== null ? { value: formatTime(m) } : null;
    },
  },
  {
    id: "median-all",
    category: "Speed",
    label: "Median",
    compute: (solves) => {
      const m = median(finalTimes(solves));
      return m !== null ? { value: formatTime(m) } : null;
    },
  },
  {
    id: "stdev-all",
    category: "Speed",
    label: "Std. deviation",
    compute: (solves) => {
      const s = stdev(finalTimes(solves));
      return s !== null ? { value: formatTime(s) } : null;
    },
  },
  {
    id: "consistency-index",
    category: "Speed",
    label: "Consistency",
    compute: (solves) => {
      const times = finalTimes(solves);
      const m = mean(times);
      const s = stdev(times);
      if (m === null || s === null || m === 0) return null;
      return { value: fmtPct(1 - s / m), sub: "lower spread relative to mean" };
    },
  },
);

const AO_NS = [3, 5, 12, 25, 50, 100, 1000];
for (const n of AO_NS) {
  tiles.push({
    id: `ao-current-${n}`,
    category: "Speed",
    label: `Current ao${n}`,
    compute: (solves) => {
      const rolling = rollingAverages(solves, n);
      const last = [...rolling].reverse().find((v) => v !== null);
      return last != null ? { value: formatTime(last) } : null;
    },
  });
  tiles.push({
    id: `ao-best-${n}`,
    category: "Speed",
    label: `Best ao${n}`,
    compute: (solves) => {
      const best = bestAverageOfN(solves, n);
      return best != null ? { value: formatTime(best) } : null;
    },
  });
}

// ---------- Records ----------
const SUB_THRESHOLDS_SEC = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 90, 120];
for (const sec of SUB_THRESHOLDS_SEC) {
  tiles.push({
    id: `sub-${sec}`,
    category: "Records",
    label: `Sub-${sec}s solves`,
    compute: (solves) => {
      const times = finalTimes(solves);
      if (times.length === 0) return null;
      const count = times.filter((t) => t < sec * 1000).length;
      return { value: fmtCount(count), sub: fmtPct(count / times.length) };
    },
  });
}

tiles.push(
  {
    id: "fewest-moves",
    category: "Records",
    label: "Fewest moves (solve)",
    compute: (solves) => {
      const counts = solves.map(tokensOf).map((t) => t.length).filter((n) => n > 0);
      return counts.length ? { value: `${Math.min(...counts)}` } : null;
    },
  },
  {
    id: "most-moves",
    category: "Records",
    label: "Most moves (solve)",
    compute: (solves) => {
      const counts = solves.map(tokensOf).map((t) => t.length).filter((n) => n > 0);
      return counts.length ? { value: `${Math.max(...counts)}` } : null;
    },
  },
  {
    id: "avg-moves",
    category: "Records",
    label: "Average moves/solve",
    compute: (solves) => {
      const counts = solves.map(tokensOf).map((t) => t.length).filter((n) => n > 0);
      const m = mean(counts);
      return m !== null ? { value: m.toFixed(1) } : null;
    },
  },
  {
    id: "peak-tps",
    category: "Records",
    label: "Peak TPS ever",
    compute: (solves) => {
      let best = 0;
      for (const s of solves) {
        if (!s.moveTimestamps || s.moveTimestamps.length < 2) continue;
        const p = peakTps(computeTpsBuckets(s.moveTimestamps));
        if (p > best) best = p;
      }
      return best > 0 ? { value: best.toFixed(1) } : null;
    },
  },
  {
    id: "avg-tps-lifetime",
    category: "Records",
    label: "Average TPS",
    compute: (solves) => {
      const rates: number[] = [];
      for (const s of solves) {
        if (!s.moveTimestamps || s.moveTimestamps.length < 2) continue;
        const a = averageTps(s.moveTimestamps);
        if (a !== null) rates.push(a);
      }
      const m = mean(rates);
      return m !== null ? { value: m.toFixed(2) } : null;
    },
  },
  {
    id: "longest-pause",
    category: "Records",
    label: "Longest mid-solve pause",
    compute: (solves) => {
      let longest = 0;
      for (const s of solves) {
        if (!s.moveTimestamps || s.moveTimestamps.length < 2) continue;
        for (let i = 1; i < s.moveTimestamps.length; i++) {
          longest = Math.max(longest, s.moveTimestamps[i] - s.moveTimestamps[i - 1]);
        }
      }
      return longest > 0 ? { value: formatTime(longest) } : null;
    },
  },
  {
    id: "total-moves-lifetime",
    category: "Records",
    label: "Total moves turned",
    compute: (solves) => {
      const total = solves.reduce((sum, s) => sum + tokensOf(s).length, 0);
      return total > 0 ? { value: fmtCount(total) } : null;
    },
  },
  {
    id: "total-solving-time",
    category: "Records",
    label: "Total solving time",
    compute: (solves) => {
      const times = finalTimes(solves);
      if (times.length === 0) return null;
      return { value: fmtHours(times.reduce((a, b) => a + b, 0)) };
    },
  },
);

// ---------- Activity ----------
tiles.push(
  {
    id: "total-solves",
    category: "Activity",
    label: "Total solves",
    compute: (solves) => (solves.length > 0 ? { value: fmtCount(solves.length) } : null),
  },
  {
    id: "first-solve-date",
    category: "Activity",
    label: "First solve",
    compute: (solves) =>
      solves.length > 0 ? { value: new Date(solves[0].date).toLocaleDateString() } : null,
  },
  {
    id: "cubing-since-days",
    category: "Activity",
    label: "Cubing (this session) for",
    compute: (solves) => {
      if (solves.length === 0) return null;
      const days = Math.max(0, Math.floor((Date.now() - solves[0].date) / DAY_MS));
      return { value: `${days}d` };
    },
  },
  {
    id: "days-since-last",
    category: "Activity",
    label: "Days since last solve",
    compute: (solves) => {
      if (solves.length === 0) return null;
      const days = Math.floor((Date.now() - solves[solves.length - 1].date) / DAY_MS);
      return { value: `${Math.max(0, days)}d` };
    },
  },
  {
    id: "total-active-days",
    category: "Activity",
    label: "Active days",
    compute: (solves) => {
      const a = computeActivity(solves);
      return a.days.length > 0 ? { value: fmtCount(a.days.length) } : null;
    },
  },
  {
    id: "current-streak",
    category: "Activity",
    label: "Current streak",
    compute: (solves) => {
      const a = computeActivity(solves);
      return { value: `${a.currentStreak}d` };
    },
  },
  {
    id: "longest-streak",
    category: "Activity",
    label: "Longest streak",
    compute: (solves) => {
      const a = computeActivity(solves);
      return a.longestStreak > 0 ? { value: `${a.longestStreak}d` } : null;
    },
  },
  {
    id: "most-in-one-day",
    category: "Activity",
    label: "Most solves in a day",
    compute: (solves) => {
      const a = computeActivity(solves);
      if (a.days.length === 0) return null;
      return { value: fmtCount(Math.max(...a.days.map((d) => d.count))) };
    },
  },
  {
    id: "avg-solves-per-active-day",
    category: "Activity",
    label: "Average solves/active day",
    compute: (solves) => {
      const a = computeActivity(solves);
      if (a.days.length === 0) return null;
      return { value: (solves.length / a.days.length).toFixed(1) };
    },
  },
  {
    id: "solves-today",
    category: "Activity",
    label: "Solves today",
    compute: (solves) => {
      const today = dayKey(Date.now());
      return { value: fmtCount(solves.filter((s) => dayKey(s.date) === today).length) };
    },
  },
  {
    id: "solves-this-week",
    category: "Activity",
    label: "Solves this week",
    compute: (solves) => {
      const since = Date.now() - 7 * DAY_MS;
      return { value: fmtCount(solves.filter((s) => s.date >= since).length) };
    },
  },
  {
    id: "solves-this-month",
    category: "Activity",
    label: "Solves this month",
    compute: (solves) => {
      const since = Date.now() - 30 * DAY_MS;
      return { value: fmtCount(solves.filter((s) => s.date >= since).length) };
    },
  },
  {
    id: "longest-gap",
    category: "Activity",
    label: "Longest break between solves",
    compute: (solves) => {
      if (solves.length < 2) return null;
      let longest = 0;
      for (let i = 1; i < solves.length; i++) longest = Math.max(longest, solves[i].date - solves[i - 1].date);
      return { value: fmtHours(longest) };
    },
  },
  {
    id: "avg-gap",
    category: "Activity",
    label: "Average gap between solves",
    compute: (solves) => {
      if (solves.length < 2) return null;
      const gaps = solves.slice(1).map((s, i) => s.date - solves[i].date);
      const m = mean(gaps);
      return m !== null ? { value: fmtHours(m) } : null;
    },
  },
);

// ---------- Penalties ----------
tiles.push(
  {
    id: "dnf-count",
    category: "Penalties",
    label: "DNFs",
    compute: (_solves, rawSolves) => {
      const c = rawSolves.filter((s) => s.penalty === "dnf").length;
      return { value: fmtCount(c) };
    },
  },
  {
    id: "dnf-rate",
    category: "Penalties",
    label: "DNF rate",
    compute: (_solves, rawSolves) => {
      if (rawSolves.length === 0) return null;
      return { value: fmtPct(rawSolves.filter((s) => s.penalty === "dnf").length / rawSolves.length) };
    },
  },
  {
    id: "plus2-count",
    category: "Penalties",
    label: "+2 penalties",
    compute: (_solves, rawSolves) => ({ value: fmtCount(rawSolves.filter((s) => s.penalty === "plus2").length) }),
  },
  {
    id: "plus2-rate",
    category: "Penalties",
    label: "+2 rate",
    compute: (_solves, rawSolves) => {
      if (rawSolves.length === 0) return null;
      return { value: fmtPct(rawSolves.filter((s) => s.penalty === "plus2").length / rawSolves.length) };
    },
  },
  {
    id: "clean-rate",
    category: "Penalties",
    label: "Clean rate",
    compute: (_solves, rawSolves) => {
      if (rawSolves.length === 0) return null;
      return { value: fmtPct(rawSolves.filter((s) => s.penalty === "none").length / rawSolves.length) };
    },
  },
);

// ---------- Phases ----------
const PHASE_NAMES = ["Cross", "F2L", "OLL", "PLL"] as const;
(PHASE_NAMES as readonly string[]).forEach((name, idx) => {
  tiles.push({
    id: `phase-avg-${name.toLowerCase()}`,
    category: "Phases",
    label: `Average ${name}`,
    compute: (solves) => {
      const m = mean(phaseDurations(solves, idx as 0 | 1 | 2 | 3));
      return m !== null ? { value: formatTime(m) } : null;
    },
  });
  tiles.push({
    id: `phase-best-${name.toLowerCase()}`,
    category: "Phases",
    label: `Best ${name}`,
    compute: (solves) => {
      const durations = phaseDurations(solves, idx as 0 | 1 | 2 | 3);
      return durations.length ? { value: formatTime(Math.min(...durations)) } : null;
    },
  });
  tiles.push({
    id: `phase-share-${name.toLowerCase()}`,
    category: "Phases",
    label: `${name} share of solve`,
    compute: (solves) => {
      // Averages each solve's *own* phase-to-total ratio (not a ratio of two
      // separately-averaged populations) — otherwise a phase whose data only
      // exists on a few, atypically long solves skews against the mean total
      // taken across every solve, and the four shares stop summing to ~100%.
      const ratios: number[] = [];
      for (const s of solves) {
        const total = solveFinalMs(s);
        const dur = phaseDurationOf(s, idx as 0 | 1 | 2 | 3);
        if (total !== null && total > 0 && dur !== undefined) ratios.push(dur / total);
      }
      const m = mean(ratios);
      return m !== null ? { value: fmtPct(m) } : null;
    },
  });
});
tiles.push({
  id: "most-variable-phase",
  category: "Phases",
  label: "Least consistent phase",
  compute: (solves) => {
    const worst = (PHASE_NAMES as readonly string[]).reduce<{ name: string; ratio: number } | null>((acc, name, idx) => {
      const durations = phaseDurations(solves, idx as 0 | 1 | 2 | 3);
      const m = mean(durations);
      const s = stdev(durations);
      if (m === null || s === null || m === 0 || durations.length < 3) return acc;
      const ratio = s / m;
      return !acc || ratio > acc.ratio ? { name, ratio } : acc;
    }, null);
    return worst ? { value: worst.name, sub: `${fmtPct(worst.ratio)} relative spread` } : null;
  },
});

// ---------- Faces ----------
FACE_LETTERS.forEach((face) => {
  tiles.push({
    id: `face-turns-${face}`,
    category: "Faces",
    label: `${face} turns (lifetime)`,
    compute: (solves) => {
      let count = 0;
      for (const s of solves) for (const t of tokensOf(s)) if (faceOfToken(t) === face) count++;
      return count > 0 ? { value: fmtCount(count) } : null;
    },
  });
});
tiles.push(
  {
    id: "most-turned-face",
    category: "Faces",
    label: "Most-turned face",
    compute: (solves) => {
      const counts = new Map<string, number>();
      for (const s of solves) for (const t of tokensOf(s)) {
        const f = faceOfToken(t);
        if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
      }
      if (counts.size === 0) return null;
      const [face] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return { value: face };
    },
  },
  {
    id: "least-turned-face",
    category: "Faces",
    label: "Least-turned face",
    compute: (solves) => {
      const counts = new Map<string, number>();
      for (const s of solves) for (const t of tokensOf(s)) {
        const f = faceOfToken(t);
        if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
      }
      if (counts.size < 2) return null;
      const [face] = [...counts.entries()].sort((a, b) => a[1] - b[1])[0];
      return { value: face };
    },
  },
  {
    id: "r-vs-l-ratio",
    category: "Faces",
    label: "R : L turn ratio",
    compute: (solves) => {
      let r = 0;
      let l = 0;
      for (const s of solves) for (const t of tokensOf(s)) {
        const f = faceOfToken(t);
        if (f === "R") r++;
        else if (f === "L") l++;
      }
      if (r + l === 0) return null;
      return { value: l === 0 ? `${r}:0` : `${(r / l).toFixed(1)}:1` };
    },
  },
);

// ---------- Events ----------
const EVENT_LABELS: Record<EventTag, string> = { oh: "One-handed", feet: "Feet", bld: "Blindfolded" };
(Object.keys(EVENT_LABELS) as EventTag[]).forEach((tag) => {
  tiles.push({
    id: `event-count-${tag}`,
    category: "Events",
    label: `${EVENT_LABELS[tag]} solves`,
    compute: (_solves, rawSolves) => {
      const count = solvesForEvent(rawSolves, tag).length;
      return count > 0 ? { value: fmtCount(count) } : null;
    },
  });
  tiles.push({
    id: `event-best-${tag}`,
    category: "Events",
    label: `${EVENT_LABELS[tag]} best`,
    compute: (_solves, rawSolves) => {
      const times = finalTimes(solvesForEvent(rawSolves, tag));
      return times.length ? { value: formatTime(Math.min(...times)) } : null;
    },
  });
  tiles.push({
    id: `event-avg-${tag}`,
    category: "Events",
    label: `${EVENT_LABELS[tag]} average`,
    compute: (_solves, rawSolves) => {
      const m = mean(finalTimes(solvesForEvent(rawSolves, tag)));
      return m !== null ? { value: formatTime(m) } : null;
    },
  });
});

// ---------- Focus (heart rate) ----------
tiles.push(
  {
    id: "hr-solve-count",
    category: "Focus",
    label: "Solves with heart rate",
    compute: (solves) => {
      const c = solves.filter((s) => s.heartRate).length;
      return c > 0 ? { value: fmtCount(c) } : null;
    },
  },
  {
    id: "hr-avg",
    category: "Focus",
    label: "Average heart rate",
    compute: (solves) => {
      const m = mean(solves.filter((s) => s.heartRate).map((s) => s.heartRate!.avg));
      return m !== null ? { value: `${Math.round(m)} bpm` } : null;
    },
  },
  {
    id: "hr-max-ever",
    category: "Focus",
    label: "Highest heart rate",
    compute: (solves) => {
      const maxes = solves.filter((s) => s.heartRate).map((s) => s.heartRate!.max);
      return maxes.length ? { value: `${Math.max(...maxes)} bpm` } : null;
    },
  },
  {
    id: "hr-fast-vs-slow",
    category: "Focus",
    label: "Calmer when fast?",
    compute: (solves) => {
      const withHr = solves.filter((s) => s.heartRate && solveFinalMs(s) !== null);
      if (withHr.length < 6) return null;
      const sorted = [...withHr].sort((a, b) => solveFinalMs(a)! - solveFinalMs(b)!);
      const half = Math.floor(sorted.length / 2);
      const fastAvg = mean(sorted.slice(0, half).map((s) => s.heartRate!.avg));
      const slowAvg = mean(sorted.slice(-half).map((s) => s.heartRate!.avg));
      if (fastAvg === null || slowAvg === null) return null;
      return { value: fastAvg <= slowAvg ? "Yes" : "No", sub: `${Math.round(fastAvg)} vs ${Math.round(slowAvg)} bpm` };
    },
  },
);

// ---------- Fun & misc ----------
tiles.push(
  {
    id: "avg-scramble-length",
    category: "Fun",
    label: "Average scramble length",
    compute: (solves) => {
      const lens = solves.map((s) => s.scramble.trim().split(/\s+/).filter(Boolean).length).filter((n) => n > 0);
      const m = mean(lens);
      return m !== null ? { value: m.toFixed(1) } : null;
    },
  },
  {
    id: "comment-count",
    category: "Fun",
    label: "Solves with a comment",
    compute: (solves) => {
      const c = solves.filter((s) => s.comment && s.comment.trim() !== "").length;
      return c > 0 ? { value: fmtCount(c) } : null;
    },
  },
  {
    id: "pb-count",
    category: "Fun",
    label: "Times you've set a PB",
    compute: (solves) => {
      const history = computePBHistory(solves);
      return history.length > 0 ? { value: fmtCount(history.length) } : null;
    },
  },
  {
    id: "days-since-last-pb",
    category: "Fun",
    label: "Days since your last PB",
    compute: (solves) => {
      const history = computePBHistory(solves);
      if (history.length === 0) return null;
      const days = Math.floor((Date.now() - history[history.length - 1].date) / DAY_MS);
      return { value: `${Math.max(0, days)}d` };
    },
  },
  {
    id: "biggest-single-improvement",
    category: "Fun",
    label: "Biggest one-solve improvement",
    compute: (solves) => {
      const times = solves.map(comparableTime).filter((t) => Number.isFinite(t));
      if (times.length < 2) return null;
      let best = 0;
      for (let i = 1; i < times.length; i++) best = Math.max(best, times[i - 1] - times[i]);
      return best > 0 ? { value: formatTime(best) } : null;
    },
  },
  {
    id: "recent-trend",
    category: "Fun",
    label: "Recent trend",
    compute: (solves) => {
      const times = finalTimes(solves);
      if (times.length < 10) return null;
      const chunk = Math.max(3, Math.floor(times.length * 0.1));
      const early = mean(times.slice(0, chunk));
      const recent = mean(times.slice(-chunk));
      if (early === null || recent === null || early === 0) return null;
      const delta = (early - recent) / early;
      return { value: delta >= 0 ? `${fmtPct(delta)} faster` : `${fmtPct(-delta)} slower`, sub: "vs your first solves" };
    },
  },
);

export const STAT_TILES: readonly StatTileDef[] = tiles;
