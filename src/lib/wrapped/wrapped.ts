import { solveFinalMs, type Solve } from "@/types";
import { wcaAverage } from "@/lib/comp/round";
import { solveCases } from "@/lib/analysis/caseHistory";
import { computeDnaAxes } from "@/lib/stats/dna";
import { traitOf } from "@/lib/stats/dnaTimeline";

/**
 * Cube Wrapped: a month (or year) of cubing told as a story — how much you
 * solved, your best moments, how much faster you got, when you're sharpest,
 * the case you saw most and the one that fought back, how many turns you
 * made, and the trait that defined the stretch. Every number comes straight
 * from the solves in the period.
 */

export type WrappedPeriod = "month" | "year";

export interface WrappedData {
  label: string;
  solves: number;
  solvingMs: number;
  days: number;
  longestStreak: number;
  best: { ms: number; date: number } | null;
  bestAo5: number | null;
  pbs: number;
  /** This period's mean minus the comparison mean (negative = faster), and what it's compared with. */
  improvement: { deltaMs: number; against: string } | null;
  sharpest: { slot: string; meanMs: number } | null;
  topCase: { name: string; count: number } | null;
  nemesis: { name: string; meanMs: number } | null;
  turns: number;
  tps: number | null;
  trait: { name: string; line: string };
}

const DAY = 864e5;
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function periodBounds(now: number, period: WrappedPeriod): { start: number; end: number; prevStart: number; label: string } {
  const d = new Date(now);
  if (period === "year") {
    return {
      start: new Date(d.getFullYear(), 0, 1).getTime(),
      end: new Date(d.getFullYear() + 1, 0, 1).getTime(),
      prevStart: new Date(d.getFullYear() - 1, 0, 1).getTime(),
      label: String(d.getFullYear()),
    };
  }
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
    prevStart: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
    label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
  };
}

const SLOTS: { name: string; test: (h: number) => boolean }[] = [
  { name: "in the morning", test: (h) => h >= 5 && h < 12 },
  { name: "in the afternoon", test: (h) => h >= 12 && h < 17 },
  { name: "in the evening", test: (h) => h >= 17 && h < 22 },
  { name: "late at night", test: (h) => h >= 22 || h < 5 },
];

export function buildWrapped(all: readonly Solve[], now: number, period: WrappedPeriod): WrappedData | null {
  const { start, end, prevStart, label } = periodBounds(now, period);
  const inPeriod = all.filter((s) => s.date >= start && s.date < end).sort((a, b) => a.date - b.date);
  if (inPeriod.length < 5) return null;
  const finals = inPeriod.map(solveFinalMs);
  const finite = inPeriod.flatMap((s, i) => (finals[i] === null ? [] : [{ ms: finals[i]!, date: s.date }]));

  // Days and the longest run of consecutive days inside the period.
  const days = [...new Set(inPeriod.map((s) => dayKey(s.date)))];
  const dayStarts = [...new Set(inPeriod.map((s) => new Date(new Date(s.date).setHours(0, 0, 0, 0)).getTime()))].sort((a, b) => a - b);
  let longestStreak = dayStarts.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < dayStarts.length; i++) {
    run = Math.round((dayStarts[i] - dayStarts[i - 1]) / DAY) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  const best = finite.length ? finite.reduce((a, b) => (b.ms < a.ms ? b : a)) : null;
  let bestAo5: number | null = null;
  for (let i = 5; i <= finals.length; i++) {
    const a = wcaAverage(finals.slice(i - 5, i), "ao5");
    if (typeof a === "number" && (bestAo5 === null || a < bestAo5)) bestAo5 = a;
  }

  // PBs: singles in the period that beat everything before them, all history counted.
  let running = Infinity;
  let pbs = 0;
  for (const s of [...all].sort((a, b) => a.date - b.date)) {
    const f = solveFinalMs(s);
    if (f === null || f >= running) continue;
    if (running !== Infinity && s.date >= start && s.date < end) pbs++;
    running = f;
  }

  const periodMean = mean(finite.map((f) => f.ms))!;
  const prev = all.filter((s) => s.date >= prevStart && s.date < start).map(solveFinalMs).filter((x): x is number => x !== null);
  let improvement: WrappedData["improvement"] = null;
  if (prev.length >= 10) {
    improvement = { deltaMs: periodMean - mean(prev)!, against: period === "year" ? "last year" : "last month" };
  } else if (finite.length >= 15) {
    const third = Math.floor(finite.length / 3);
    improvement = { deltaMs: mean(finite.slice(-third).map((f) => f.ms))! - mean(finite.slice(0, third).map((f) => f.ms))!, against: "the start of it" };
  }

  const slotMeans = SLOTS.map((slot) => {
    const xs = finite.filter((f) => slot.test(new Date(f.date).getHours())).map((f) => f.ms);
    return { slot: slot.name, n: xs.length, meanMs: mean(xs) ?? Infinity };
  }).filter((x) => x.n >= 5);
  const sharpest = slotMeans.length >= 2 ? slotMeans.reduce((a, b) => (b.meanMs < a.meanMs ? b : a)) : null;

  const occurrences = inPeriod.filter((s) => s.reconstruction && s.moveTimestamps?.length).flatMap(solveCases).filter((o) => o.group !== "F2L");
  const byCase = new Map<string, number[]>();
  for (const o of occurrences) byCase.set(o.name, [...(byCase.get(o.name) ?? []), o.recognitionMs + o.executionMs]);
  const cases = [...byCase].map(([name, xs]) => ({ name, count: xs.length, meanMs: mean(xs)! }));
  const topCase = cases.length ? cases.reduce((a, b) => (b.count > a.count ? b : a)) : null;
  const multi = cases.filter((c) => c.count >= 2);
  const nemesis = multi.length ? multi.reduce((a, b) => (b.meanMs > a.meanMs ? b : a)) : null;

  const smart = inPeriod.filter((s) => s.reconstruction);
  const turns = smart.reduce((a, s) => a + s.reconstruction!.split(/\s+/).filter(Boolean).length, 0);
  const smartMs = smart.reduce((a, s) => a + s.timeMs, 0);

  return {
    label,
    solves: inPeriod.length,
    solvingMs: inPeriod.reduce((a, s) => a + s.timeMs, 0),
    days: days.length,
    longestStreak,
    best: best && { ms: best.ms, date: best.date },
    bestAo5,
    pbs,
    improvement,
    sharpest: sharpest && { slot: sharpest.slot, meanMs: sharpest.meanMs },
    topCase: topCase && { name: topCase.name, count: topCase.count },
    // The slowest case you saw more than once — the one that fought back.
    nemesis: nemesis && multi.length > 1 ? { name: nemesis.name, meanMs: nemesis.meanMs } : null,
    turns,
    tps: smartMs > 0 ? turns / (smartMs / 1000) : null,
    trait: traitOf(computeDnaAxes([...inPeriod])),
  };
}

/** One story card: a small kicker, a big number or phrase, and a line under it. */
export interface Slide {
  kicker: string;
  big: string;
  /** When the big text is a number, count up to it. */
  count?: { to: number; decimals: number; suffix?: string };
  line: string;
}

const s2 = (ms: number) => (ms / 1000).toFixed(2);

export function wrappedSlides(w: WrappedData): Slide[] {
  const hours = w.solvingMs / 3600e3;
  const slides: Slide[] = [
    { kicker: "Cube Wrapped", big: w.label, line: "Your cubing, told as a story." },
    {
      kicker: "You solved",
      big: String(w.solves),
      count: { to: w.solves, decimals: 0 },
      line: `${hours >= 1 ? `${hours.toFixed(1)} hours` : `${Math.round(hours * 60)} minutes`} of pure solving, across ${w.days} day${w.days === 1 ? "" : "s"}${w.longestStreak > 1 ? ` — a ${w.longestStreak}-day streak at best` : ""}.`,
    },
  ];
  if (w.best) {
    slides.push({
      kicker: "Your best single",
      big: s2(w.best.ms),
      count: { to: w.best.ms / 1000, decimals: 2 },
      line: `${new Date(w.best.date).toLocaleDateString(undefined, { month: "long", day: "numeric" })}${w.bestAo5 !== null ? ` · best Ao5 ${s2(w.bestAo5)}` : ""}${w.pbs ? ` · ${w.pbs} new PB${w.pbs === 1 ? "" : "s"}` : ""}.`,
    });
  }
  if (w.improvement) {
    const faster = w.improvement.deltaMs < 0;
    slides.push({
      kicker: faster ? "You got faster" : "A tougher stretch",
      big: `${faster ? "−" : "+"}${s2(Math.abs(w.improvement.deltaMs))}s`,
      count: { to: Math.abs(w.improvement.deltaMs) / 1000, decimals: 2, suffix: "s" },
      line: faster ? `On average, against ${w.improvement.against}.` : `Slower on average than ${w.improvement.against} — every plateau ends.`,
    });
  }
  if (w.sharpest) slides.push({ kicker: "You're sharpest", big: w.sharpest.slot, line: `Averaging ${s2(w.sharpest.meanMs)} then.` });
  if (w.topCase) {
    slides.push({
      kicker: "Your most-seen case",
      big: w.topCase.name,
      line: `${w.topCase.count} times.${w.nemesis ? ` Your nemesis: ${w.nemesis.name}, ${s2(w.nemesis.meanMs)}s on average.` : ""}`,
    });
  }
  if (w.turns > 0) {
    slides.push({
      kicker: "You turned",
      big: w.turns.toLocaleString(),
      count: { to: w.turns, decimals: 0 },
      line: `faces on your smart cube${w.tps ? ` — ${w.tps.toFixed(2)} turns a second, pauses and all` : ""}.`,
    });
  }
  slides.push({ kicker: "Your trait", big: w.trait.name, line: w.trait.line });
  slides.push({ kicker: "That's a wrap", big: "See you next time", line: `${w.solves} solves in ${w.label}. Keep turning.` });
  return slides;
}

export const SLIDE_MS = 3200;
