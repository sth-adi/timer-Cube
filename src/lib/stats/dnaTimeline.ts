import { solveFinalMs, type Solve } from "@/types";
import { MIN_SOLVES_FOR_DNA, computeDnaAxes, type DnaAxis } from "./dna";

/**
 * Living Cube DNA: the same self-referential radar, computed period by
 * period through your history, so the fingerprint becomes a story — how
 * your shape changed, what grew, what slipped, and which trait defined
 * each stretch. Periods are calendar months, or weeks when the whole
 * history is shorter than a couple of months.
 */

export type DnaPeriod = "month" | "week";

export interface DnaSnapshot {
  key: string;
  label: string;
  start: number;
  count: number;
  meanMs: number | null;
  bestMs: number | null;
  axes: DnaAxis[];
  trait: Trait;
}

export interface Trait {
  name: string;
  line: string;
}

const TRAITS: Record<string, Trait> = {
  Speed: { name: "The Sprinter", line: "Your average ran close to your best." },
  Consistency: { name: "The Metronome", line: "Solve after solve, the same time." },
  Volume: { name: "The Grinder", line: "More solves than anything else." },
  Cross: { name: "Cross Architect", line: "Crosses as good as your best, every time." },
  F2L: { name: "Pair Machine", line: "F2L at your peak, solve after solve." },
  OLL: { name: "Pattern Reader", line: "OLL your strongest step." },
  PLL: { name: "The Closer", line: "PLL finished like your best." },
};

export function traitOf(axes: readonly DnaAxis[]): Trait {
  const top = [...axes].sort((a, b) => b.score - a.score)[0];
  return (top && TRAITS[top.label]) ?? { name: top ? `${top.label} specialist` : "Just getting started", line: top ? `${top.label} was your strongest axis.` : "" };
}

function periodKey(t: number, period: DnaPeriod): { key: string; start: number; label: string } {
  const d = new Date(t);
  if (period === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return { key: `${d.getFullYear()}-${d.getMonth()}`, start, label: d.toLocaleDateString(undefined, { month: "short", year: "numeric" }) };
  }
  const day = (d.getDay() + 6) % 7; // Monday-start weeks
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return { key: `w${monday.getTime()}`, start: monday.getTime(), label: monday.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
}

/** Month buckets for a history longer than ~2 months, else weeks — enough snapshots either way to see a trend. */
export function choosePeriod(solves: readonly Solve[]): DnaPeriod {
  if (!solves.length) return "month";
  const dates = solves.map((s) => s.date);
  return Math.max(...dates) - Math.min(...dates) > 60 * 864e5 ? "month" : "week";
}

export function buildDnaTimeline(solves: readonly Solve[], period: DnaPeriod = choosePeriod(solves)): DnaSnapshot[] {
  const buckets = new Map<string, { start: number; label: string; solves: Solve[] }>();
  for (const s of solves) {
    const p = periodKey(s.date, period);
    const b = buckets.get(p.key) ?? { start: p.start, label: p.label, solves: [] };
    b.solves.push(s);
    buckets.set(p.key, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[1].start - b[1].start)
    .filter(([, b]) => b.solves.length >= MIN_SOLVES_FOR_DNA)
    .map(([key, b]) => {
      const finals = b.solves.map(solveFinalMs).filter((x): x is number => x !== null);
      const axes = computeDnaAxes(b.solves);
      return {
        key,
        label: b.label,
        start: b.start,
        count: b.solves.length,
        meanMs: finals.length ? finals.reduce((a, x) => a + x, 0) / finals.length : null,
        bestMs: finals.length ? Math.min(...finals) : null,
        axes,
        trait: traitOf(axes),
      };
    });
}

/** Two snapshots' axes on the same labels (the ones both have), in the first one's order — what a radar overlay needs. */
export function alignAxes(a: readonly DnaAxis[], b: readonly DnaAxis[]): { labels: string[]; a: number[]; b: number[] } {
  const labels = a.map((x) => x.label).filter((l) => b.some((y) => y.label === l));
  return {
    labels,
    a: labels.map((l) => a.find((x) => x.label === l)!.score),
    b: labels.map((l) => b.find((x) => x.label === l)!.score),
  };
}

/** Radar partway from one snapshot to the next, for the animated playback. */
export function morphAxes(from: readonly DnaAxis[], to: readonly DnaAxis[], t: number): DnaAxis[] {
  const { labels, a, b } = alignAxes(from, to);
  if (labels.length < 3) return t < 0.5 ? [...from] : [...to];
  const k = Math.min(1, Math.max(0, t));
  return labels.map((label, i) => ({ label, score: a[i] + (b[i] - a[i]) * k }));
}

export interface DnaChange {
  label: string;
  delta: number;
}

export interface DnaEvolution {
  /** Axis changes from `from` to `to`, biggest movement first. */
  changes: DnaChange[];
  meanDeltaMs: number | null;
  headline: string;
}

export function compareSnapshots(from: DnaSnapshot, to: DnaSnapshot): DnaEvolution {
  const { labels, a, b } = alignAxes(from.axes, to.axes);
  const changes = labels.map((label, i) => ({ label, delta: b[i] - a[i] })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const meanDeltaMs = from.meanMs !== null && to.meanMs !== null ? to.meanMs - from.meanMs : null;
  const up = changes.find((c) => c.delta >= 3);
  const down = changes.find((c) => c.delta <= -3);
  const pace =
    meanDeltaMs === null
      ? ""
      : Math.abs(meanDeltaMs) < 50
        ? "Average held steady"
        : meanDeltaMs < 0
          ? `Average ${(-meanDeltaMs / 1000).toFixed(2)}s faster`
          : `Average ${(meanDeltaMs / 1000).toFixed(2)}s slower`;
  const parts = [pace, up ? `${up.label} up ${Math.round(up.delta)}` : "", down ? `${down.label} down ${Math.round(-down.delta)}` : ""].filter(Boolean);
  const traitShift = from.trait.name !== to.trait.name ? ` — from ${from.trait.name} to ${to.trait.name}` : "";
  return { changes, meanDeltaMs, headline: `${parts.join(", ") || "Much the same shape"} since ${from.label}${traitShift}.` };
}
