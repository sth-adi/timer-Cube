import { IDENTITY, apply, mul, sequenceMatrix, tokenMatrix, type Mat3 } from "@/lib/gyro/orientation";
import { pairSegments } from "@/lib/blindspots/blindSpots";
import { milestoneTimes } from "@/lib/pacer/pacer";
import { PAIR_CORNER_VECTORS, mean, median, type XraySolveInput } from "@/lib/xray/common";

/**
 * Rotation Audit. A gyro cube records every whole-cube rotation, so across
 * your history the app can answer the question every F2L coach asks: *why*
 * do you rotate? Each F2L pair is filed by where its slot was, relative to
 * how you were holding the cube, when you started on it — front-right,
 * front-left, back-right, back-left — and whether you rotated before
 * inserting it. Each rotation is priced by how much longer the gap around
 * it was than your normal gap between turns.
 */

export type SlotPos = "FR" | "FL" | "BR" | "BL";
export const SLOT_POSITIONS: readonly SlotPos[] = ["BL", "BR", "FL", "FR"];
export const SLOT_POS_LABEL: Record<SlotPos, string> = { FR: "front-right", FL: "front-left", BR: "back-right", BL: "back-left" };

const ROTATION = /^[xyz]['2]?$/;

export interface GyroSolveInput extends XraySolveInput {
  rotations: readonly { atMs: number; token: string }[];
  orientedReconstruction: string;
}

/** How the cube was held at the first turn: the rotation tokens the oriented reconstruction opens with. */
export function startGrip(oriented: string): Mat3 {
  const lead: string[] = [];
  for (const t of oriented.split(/\s+/).filter(Boolean)) {
    if (!ROTATION.test(t)) break;
    lead.push(t);
  }
  return lead.length ? sequenceMatrix(lead.join(" ")) : IDENTITY;
}

/** The grip at `atMs`, applying every rotation up to then. */
export function gripAt(start: Mat3, rotations: readonly { atMs: number; token: string }[], atMs: number): Mat3 {
  let g = start;
  for (const r of rotations) {
    if (r.atMs > atMs) break;
    for (const t of r.token.split(" ")) g = mul(tokenMatrix(t), g);
  }
  return g;
}

/** Where a pair's slot is, from the cuber's point of view, in grip `g`. */
export function slotPosition(g: Mat3, pair: number): SlotPos {
  const v = apply(g, PAIR_CORNER_VECTORS[pair]);
  return `${v[2] > 0 ? "F" : "B"}${v[0] > 0 ? "R" : "L"}` as SlotPos;
}

export interface RotatedPair {
  pair: number;
  /** Slot position when you started on the pair, and when it went in. */
  startPos: SlotPos;
  insertPos: SlotPos;
  rotations: number;
  totalMs: number;
}

export interface SolveRotations {
  total: number;
  byPhase: { cross: number; f2l: number; ll: number };
  pairs: RotatedPair[];
  /** Extra ms each rotation cost over your normal gap between turns. */
  costs: number[];
  tokens: string[];
}

export function analyzeRotations(input: GyroSolveInput): SolveRotations | null {
  const { moves, timesMs, rotations } = input;
  if (moves.length < 2 || timesMs.length !== moves.length) return null;
  const rots = [...rotations].sort((a, b) => a.atMs - b.atMs);
  const start = startGrip(input.orientedReconstruction);
  const marks = milestoneTimes(input);
  const crossMs = marks[0] ?? Infinity;
  const f2lMs = marks[4] ?? Infinity;

  const byPhase = { cross: 0, f2l: 0, ll: 0 };
  for (const r of rots) {
    if (r.atMs <= crossMs) byPhase.cross++;
    else if (r.atMs <= f2lMs) byPhase.f2l++;
    else byPhase.ll++;
  }

  const gaps = timesMs.slice(1).map((t, i) => t - timesMs[i]);
  const normal = median(gaps) ?? 0;
  const costs: number[] = [];
  for (const r of rots) {
    const next = timesMs.findIndex((t) => t > r.atMs);
    if (next <= 0) continue;
    costs.push(Math.max(0, timesMs[next] - timesMs[next - 1] - normal));
  }

  const pairs: RotatedPair[] = pairSegments(input).map((s) => {
    const fromMs = timesMs[s.fromIndex];
    const toMs = timesMs[s.toIndex];
    return {
      pair: s.pair,
      startPos: slotPosition(gripAt(start, rots, fromMs), s.pair),
      insertPos: slotPosition(gripAt(start, rots, toMs), s.pair),
      rotations: rots.filter((r) => r.atMs > fromMs && r.atMs <= toMs).length,
      totalMs: s.totalMs,
    };
  });

  return { total: rots.length, byPhase, pairs, costs, tokens: rots.map((r) => r.token) };
}

export interface SlotStats {
  pos: SlotPos;
  pairs: number;
  rotatedRate: number;
  msRotated: number | null;
  msStill: number | null;
}

export interface RotationReport {
  solves: number;
  perSolve: number;
  byPhase: { cross: number; f2l: number; ll: number };
  bySlot: SlotStats[];
  avgCostMs: number | null;
  /** Estimated ms per solve that rotations cost. */
  costPerSolveMs: number;
  tokenCounts: { token: string; count: number }[];
  trend: number[];
  insights: string[];
}

export function buildRotationReport(perSolve: readonly (SolveRotations | null)[]): RotationReport | null {
  const solves = perSolve.filter((s): s is SolveRotations => s !== null);
  if (solves.length === 0) return null;
  const n = solves.length;
  const pairs = solves.flatMap((s) => s.pairs);
  const bySlot = SLOT_POSITIONS.map((pos): SlotStats => {
    const xs = pairs.filter((p) => p.startPos === pos);
    const rotated = xs.filter((p) => p.rotations > 0);
    return {
      pos,
      pairs: xs.length,
      rotatedRate: xs.length ? rotated.length / xs.length : 0,
      msRotated: mean(rotated.map((p) => p.totalMs)),
      msStill: mean(xs.filter((p) => p.rotations === 0).map((p) => p.totalMs)),
    };
  });
  const costs = solves.flatMap((s) => s.costs);
  const avgCostMs = mean(costs);
  const counts = new Map<string, number>();
  for (const t of solves.flatMap((s) => s.tokens)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const byPhase = {
    cross: solves.reduce((a, s) => a + s.byPhase.cross, 0) / n,
    f2l: solves.reduce((a, s) => a + s.byPhase.f2l, 0) / n,
    ll: solves.reduce((a, s) => a + s.byPhase.ll, 0) / n,
  };

  const insights: string[] = [];
  const back = bySlot.filter((s) => (s.pos === "BL" || s.pos === "BR") && s.pairs >= 4 && s.rotatedRate >= 0.6).sort((a, b) => b.rotatedRate - a.rotatedRate);
  for (const s of back) {
    insights.push(
      `You rotate for ${Math.round(s.rotatedRate * 100)}% of pairs that start ${SLOT_POS_LABEL[s.pos]}. A few back-slot inserts (solving it from the front with ${
        s.pos === "BR" ? "R U' R' / R' U R" : "L' U L / L U' L'"
      }-style moves) would skip that rotation.`,
    );
  }
  const front = bySlot.filter((s) => (s.pos === "FL" || s.pos === "FR") && s.pairs >= 4 && s.rotatedRate >= 0.5);
  for (const s of front) {
    insights.push(`Half or more of your ${SLOT_POS_LABEL[s.pos]} pairs still get a rotation — that slot is solvable from where you're holding it.`);
  }
  const withRot = pairs.filter((p) => p.rotations > 0);
  const without = pairs.filter((p) => p.rotations === 0);
  const a = mean(withRot.map((p) => p.totalMs));
  const b = mean(without.map((p) => p.totalMs));
  if (a !== null && b !== null && withRot.length >= 4 && without.length >= 4 && a - b > 150) {
    insights.push(`Pairs where you rotate take ${(a / 1000).toFixed(2)}s; pairs without a rotation take ${(b / 1000).toFixed(2)}s.`);
  }
  if (byPhase.ll >= 0.8) insights.push(`You rotate ${byPhase.ll.toFixed(1)} times per solve in the last layer — an AUF (U) instead of a y usually works, and recognising OLL/PLL from any angle removes most of them.`);
  if (insights.length === 0) insights.push("No rotation habit stands out — you rotate where it pays.");

  return {
    solves: n,
    perSolve: solves.reduce((a2, s) => a2 + s.total, 0) / n,
    byPhase,
    bySlot,
    avgCostMs,
    costPerSolveMs: costs.reduce((x, y) => x + y, 0) / n,
    tokenCounts: [...counts.entries()].map(([token, count]) => ({ token, count })).sort((x, y) => y.count - x.count),
    trend: solves.map((s) => s.total),
    insights,
  };
}
