import { simplify } from "@/lib/smartcube/route";
import { pairSegments } from "@/lib/blindspots/blindSpots";
import { MILESTONES, milestoneTimes } from "@/lib/pacer/pacer";
import { PAIR_LABELS, crossSolved, replayStates } from "@/lib/xray/common";

/**
 * Solve Rematch: the same scramble, solved again, compared with the first
 * time — milestone by milestone, stretch by stretch, and path by path
 * (did you find the same cross? the same pair order?). Re-solving a
 * scramble you've seen is how you find out whether a slow stretch was the
 * scramble or you.
 */

export interface SolveSide {
  moves: readonly string[];
  /** Ms from the first turn. */
  timesMs: readonly number[];
  /** The official time, when known (a saved solve's timeMs); defaults to the last turn's time. */
  totalMs?: number;
}

export interface Row {
  label: string;
  a: number | null;
  b: number | null;
  /** b − a (negative = the rematch was faster). */
  delta: number | null;
}

export interface Comparison {
  totalA: number;
  totalB: number;
  turnsA: number;
  turnsB: number;
  milestones: Row[];
  stretches: Row[];
  crossA: string[];
  crossB: string[];
  sameCross: boolean;
  orderA: string[];
  orderB: string[];
  sameOrder: boolean;
  gain: Row | null;
  loss: Row | null;
  verdict: string;
  notes: string[];
}

function crossMoves(scramble: string, moves: readonly string[]): string[] {
  const { after } = replayStates(scramble, moves);
  const idx = after.findIndex((c) => crossSolved(c));
  return idx < 0 ? [] : simplify(moves.slice(0, idx + 1));
}

const pairOrder = (scramble: string, s: SolveSide) =>
  pairSegments({ scramble, moves: s.moves, timesMs: s.timesMs })
    .sort((x, y) => x.order - y.order)
    .map((p) => PAIR_LABELS[p.pair]);

const d = (a: number | null, b: number | null) => (a === null || b === null ? null : b - a);
const s2 = (ms: number) => `${(Math.abs(ms) / 1000).toFixed(2)}s`;

export function compareSolves(scramble: string, a: SolveSide, b: SolveSide): Comparison {
  const ma = milestoneTimes({ scramble, ...a });
  const mb = milestoneTimes({ scramble, ...b });
  const milestones = MILESTONES.map((label, k) => ({ label, a: ma[k], b: mb[k], delta: d(ma[k], mb[k]) }));
  const stretch = (m: (number | null)[], k: number) => (m[k] === null || (k > 0 && m[k - 1] === null) ? null : m[k]! - (k > 0 ? m[k - 1]! : 0));
  const stretches = MILESTONES.map((label, k) => {
    const sa = stretch(ma, k);
    const sb = stretch(mb, k);
    return { label: k === 6 ? "PLL" : label, a: sa, b: sb, delta: d(sa, sb) };
  });
  const scored = stretches.filter((r) => r.delta !== null);
  const gain = scored.reduce<Row | null>((g, r) => (r.delta! < 0 && (!g || r.delta! < g.delta!) ? r : g), null);
  const loss = scored.reduce<Row | null>((l, r) => (r.delta! > 0 && (!l || r.delta! > l.delta!) ? r : l), null);

  const crossA = crossMoves(scramble, a.moves);
  const crossB = crossMoves(scramble, b.moves);
  const sameCross = crossA.join(" ") === crossB.join(" ");
  const orderA = pairOrder(scramble, a);
  const orderB = pairOrder(scramble, b);
  const sameOrder = orderA.join() === orderB.join();

  const totalA = a.totalMs ?? a.timesMs[a.timesMs.length - 1] ?? 0;
  const totalB = b.totalMs ?? b.timesMs[b.timesMs.length - 1] ?? 0;
  const diff = totalB - totalA;
  const verdict =
    Math.abs(diff) < 50 ? "Dead level with the original." : diff < 0 ? `Rematch won by ${s2(diff)}.` : `The original still wins, by ${s2(diff)}.`;

  const notes: string[] = [];
  if (gain) notes.push(`Biggest gain: ${gain.label} (−${s2(gain.delta!)}).`);
  if (loss) notes.push(`Biggest loss: ${loss.label} (+${s2(loss.delta!)}).`);
  if (crossA.length && crossB.length) {
    notes.push(
      sameCross
        ? `Same cross both times (${crossA.length} turns).`
        : `A different cross: ${crossB.length} turns this time vs ${crossA.length} before.`,
    );
  }
  if (orderA.length && orderB.length) notes.push(sameOrder ? "Same F2L pair order." : "You solved the F2L pairs in a different order.");

  return {
    totalA,
    totalB,
    turnsA: simplify(a.moves).length,
    turnsB: simplify(b.moves).length,
    milestones,
    stretches,
    crossA,
    crossB,
    sameCross,
    orderA,
    orderB,
    sameOrder,
    gain,
    loss,
    verdict,
    notes,
  };
}
