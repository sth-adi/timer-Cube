import { solveFinalMs, type Solve } from "@/types";
import { avg } from "@/lib/analytics/solveMetrics";
import { relativeSittings, SITTING_GAP_MS, summarizeMomentum } from "@/lib/analysis/momentum";
import { trimmedMean } from "@/lib/journey/journey";
import { neededForTarget, wcaAverage } from "@/lib/comp/round";

/**
 * Live Session Coach: the Warm-up & Fatigue, Momentum and Tilt reports
 * turned from post-mortems into a companion that talks to you between
 * solves. Your history says how you usually behave — how many solves you
 * need to warm up, how a bad solve carries into the next, whether fast
 * solves cluster, when you start to fade — and the sitting you're in right
 * now is read against that, one card at a time, with an eye on a PB
 * average when one is within reach.
 */

export interface CoachProfile {
  /** Solves it usually takes to get within 2% of sitting pace (1 = no warm-up needed). */
  warmupSolves: number;
  /** How much slower those warm-up solves are. */
  coldPenalty: number;
  /** Average of the solve right after a bad one (vs its sitting's median), or null without enough data. */
  afterBadRel: number | null;
  tilter: boolean;
  hasMomentum: boolean;
  /** Solve number around which you usually start to fade, or null if you don't. */
  fadeFrom: number | null;
  sittings: number;
}

export type CardKind = "warmup" | "bounce" | "tilt" | "hot" | "fading" | "pb" | "steady";

export interface CoachCard {
  kind: CardKind;
  title: string;
  line: string;
  tone: "good" | "warn" | "info";
}

export interface LiveCoach {
  profile: CoachProfile | null;
  /** Solves in the sitting so far. */
  n: number;
  /** Sitting's trimmed mean vs your typical level (0.03 = 3% slower), once there are 3 solves. */
  vsTypical: number | null;
  cards: CoachCard[];
}

const BAD = 0.15;
const FAST = 0.03;

/** Your usual sitting behaviour, from time alone (keyboard solves count too). */
export function buildProfile(history: readonly Solve[]): CoachProfile | null {
  const sittings = relativeSittings(history.filter((s) => !s.event));
  if (sittings.length < 3) return null;
  const byPos = (from: number, to: number) => avg(sittings.flatMap((g) => g.slice(from - 1, to).map((x) => x.rel)));
  // Warm-up: the first position at which you're typically within 2% of the sitting median.
  let warmupSolves = 6;
  for (let p = 1; p <= 5; p++) {
    const xs = sittings.filter((g) => g.length >= p).map((g) => g[p - 1].rel);
    if (xs.length >= 3 && avg(xs) <= 0.02) {
      warmupSolves = p;
      break;
    }
  }
  const coldPenalty = warmupSolves > 1 ? Math.max(0, byPos(1, warmupSolves - 1)) : 0;

  // Tilt, time-only: after a solve 15%+ over its sitting's median, how does the next one go?
  const afterBad: number[] = [];
  for (const g of sittings) for (let i = 0; i + 1 < g.length; i++) if (g[i].rel >= BAD) afterBad.push(g[i + 1].rel);
  const afterBadRel = afterBad.length >= 6 ? avg(afterBad) : null;

  // Fade: long sittings whose later solves drift above the middle stretch.
  const long = sittings.filter((g) => g.length >= 25);
  let fadeFrom: number | null = null;
  if (long.length >= 2) {
    const mid = avg(long.flatMap((g) => g.slice(5, 20).map((x) => x.rel)));
    for (const from of [20, 30, 40, 60]) {
      const later = long.filter((g) => g.length > from).flatMap((g) => g.slice(from, from + 10).map((x) => x.rel));
      if (later.length >= 10 && avg(later) - mid >= 0.03) {
        fadeFrom = from;
        break;
      }
    }
  }
  return {
    warmupSolves,
    coldPenalty,
    afterBadRel,
    tilter: afterBadRel !== null && afterBadRel >= 0.04,
    hasMomentum: summarizeMomentum(sittings)?.hasMomentum ?? false,
    fadeFrom,
    sittings: sittings.length,
  };
}

/** The solves of the sitting you're in: everything back to the last gap of 15 minutes. */
export function currentSitting(solves: readonly Solve[], now: number): Solve[] {
  const sorted = [...solves].sort((a, b) => a.date - b.date);
  if (!sorted.length || now - sorted[sorted.length - 1].date >= SITTING_GAP_MS) return [];
  let i = sorted.length - 1;
  while (i > 0 && sorted[i].date - sorted[i].timeMs - sorted[i - 1].date < SITTING_GAP_MS) i--;
  return sorted.slice(i);
}

const pct = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(Math.round(r * 100))}%`;
const s2 = (ms: number) => (ms / 1000).toFixed(2);

export function liveCoach(history: readonly Solve[], sitting: readonly Solve[], opts: { typicalMs: number | null; bestAo5Ms: number | null }): LiveCoach {
  const profile = buildProfile(history);
  const n = sitting.length;
  const cards: CoachCard[] = [];
  const finals = sitting.map(solveFinalMs);
  const times = finals.filter((x): x is number => x !== null);
  const typical = opts.typicalMs;
  const vsTypical = typical && times.length >= 3 ? trimmedMean(times)! / typical - 1 : null;
  const rel = (ms: number | null) => (ms === null ? Infinity : typical ? ms / typical - 1 : 0);

  if (n === 0) {
    const w = profile?.warmupSolves ?? 3;
    cards.push({
      kind: "warmup",
      title: "New sitting",
      line: profile && w > 1 ? `Your first ${w - 1} solve${w === 2 ? "" : "s"} usually run ${pct(profile.coldPenalty)} — warm up before you judge anything.` : "Fresh start. Ease into it.",
      tone: "info",
    });
    return { profile, n, vsTypical, cards };
  }

  const last = finals[n - 1];
  const lastRel = rel(last);

  // PB average on: the last four of the next ao5 are in, and a PB is still possible.
  if (opts.bestAo5Ms !== null && n >= 4) {
    const need = neededForTarget(finals.slice(-4), opts.bestAo5Ms - 10);
    if (typeof need === "number") cards.push({ kind: "pb", title: "PB average on", line: `A ${s2(need)} or better on the next solve beats your best ao5 (${s2(opts.bestAo5Ms)}).`, tone: "good" });
    else if (need === "locked") {
      const ao = wcaAverage([...finals.slice(-4), null], "ao5");
      cards.push({ kind: "pb", title: "PB average locked in", line: `Finish this one — even a DNF leaves a new best ao5${ao ? ` (${s2(ao)})` : ""}.`, tone: "good" });
    }
  }

  if (profile && n < profile.warmupSolves) {
    cards.push({
      kind: "warmup",
      title: `Warm-up ${n} of ${profile.warmupSolves - 1}`,
      line: `Your early solves usually run ${pct(profile.coldPenalty)}. ${lastRel > 0.05 ? "This is normal — keep going." : "Already sharp today."}`,
      tone: "info",
    });
  }

  if (lastRel >= BAD && (!profile || n >= profile.warmupSolves)) {
    if (profile?.tilter)
      cards.push({ kind: "tilt", title: "Don't let it carry", line: `After a bad solve your next one usually runs ${pct(profile.afterBadRel!)}. Put the cube down, breathe, reset your grip — then go.`, tone: "warn" });
    else cards.push({ kind: "bounce", title: "Shake it off", line: `${last === null ? "A DNF" : `${s2(last)}`} — but you usually bounce straight back. Next one.`, tone: "info" });
  }

  const tail = finals.slice(-3);
  if (tail.length === 3 && tail.every((t) => rel(t) <= -FAST)) {
    cards.push({
      kind: "hot",
      title: "On a run",
      line: profile?.hasMomentum ? "Three fast in a row — and your fast solves cluster. Keep the rhythm; don't rush the gap between solves." : "Three fast in a row. Stay loose and keep solving.",
      tone: "good",
    });
  }

  if (times.length >= 15) {
    const windows = Array.from({ length: times.length - 4 }, (_, i) => trimmedMean(times.slice(i, i + 5))!);
    const peak = Math.min(...windows);
    const recent = windows[windows.length - 1];
    const fadeDue = profile?.fadeFrom != null && n >= profile.fadeFrom;
    if (recent / peak - 1 >= 0.05 || (fadeDue && recent / peak - 1 >= 0.03)) {
      cards.push({
        kind: "fading",
        title: "You're fading",
        line: `Your last five are ${pct(recent / peak - 1)} on this sitting's best stretch${fadeDue ? ` — right about where you usually tire (solve ${profile!.fadeFrom})` : ""}. Five minutes off resets it.`,
        tone: "warn",
      });
    }
  }

  if (!cards.length || cards.every((c) => c.kind === "pb")) {
    cards.push({
      kind: "steady",
      title: "Steady",
      line: vsTypical === null ? `${n} solve${n === 1 ? "" : "s"} in.` : `${n} solves in, ${pct(vsTypical)} against your usual ${typical ? s2(typical) : ""}.`,
      tone: vsTypical !== null && vsTypical <= 0 ? "good" : "info",
    });
  }

  const order: CardKind[] = ["tilt", "pb", "fading", "hot", "bounce", "warmup", "steady"];
  cards.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { profile, n, vsTypical, cards };
}
