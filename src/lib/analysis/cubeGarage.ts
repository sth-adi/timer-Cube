import type { Solve } from "@/types";
import { solveFinalMs } from "@/types";
import { bestAverageOfN, normalSolves, rollingAverages } from "@/lib/stats/stats";

/**
 * The Cube Garage: your smart cubes side by side. Every smart-cube solve
 * records which cube it was made on (see cubeIdentity.ts), so each cube
 * gets its own record — and the two things a cube can actually be blamed
 * for are measured directly: how fast you turn it, and how often it lost a
 * turn over Bluetooth mid-solve.
 */

/** Below this many solves a cube's numbers are too thin to compare against another's. */
export const MIN_SOLVES_TO_COMPARE = 10;
/** A median gap smaller than this between two cubes is noise, not a difference. */
const MEANINGFUL_GAP = 0.03;
/** This share of a cube's solves losing a turn is worth saying out loud. */
const RELIABILITY_FLAG_RATE = 0.1;

export interface GarageCube {
  id: string;
  name: string;
  protocol: string | null;
  /** Nickname if you gave it one, else the name it advertises. */
  label: string;
  solves: number;
  dnfs: number;
  best: number | null;
  median: number | null;
  currentAo12: number | null;
  bestAo12: number | null;
  /** Turns per second over the solves that recorded their turns. */
  avgTps: number | null;
  /** Share of solves in which a turn was lost over Bluetooth and corrected from the cube's own report. */
  correctedRate: number;
  firstAt: number;
  lastAt: number;
  /** Enough solves to compare against another cube. */
  comparable: boolean;
}

export interface GarageReport {
  cubes: GarageCube[];
  /** Smart-cube solves from before cubes were tracked — no way to know which cube they were on. */
  untracked: number;
  /** Plain-language takeaways; only ever claims what the numbers support. */
  notes: string[];
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function garageReport(allSolves: Solve[], nicknames: Record<string, string> = {}): GarageReport {
  const solves = normalSolves(allSolves);
  const byCube = new Map<string, Solve[]>();
  let untracked = 0;
  for (const s of solves) {
    if (s.cube) {
      const list = byCube.get(s.cube.id) ?? [];
      list.push(s);
      byCube.set(s.cube.id, list);
    } else if (s.moveTimestamps && s.moveTimestamps.length > 0) {
      untracked++;
    }
  }

  const cubes: GarageCube[] = [];
  for (const [id, raw] of byCube) {
    const list = [...raw].sort((a, b) => a.date - b.date);
    // The most recently recorded name — a cube can be renamed in its own app.
    const latest = list[list.length - 1].cube!;
    const times = list.map(solveFinalMs).filter((t): t is number => t !== null);
    const tps = list
      .filter((s) => s.moveTimestamps && s.moveTimestamps.length > 0 && s.timeMs > 0)
      .map((s) => s.moveTimestamps!.length / (s.timeMs / 1000));
    const rolling = rollingAverages(list, 12);
    cubes.push({
      id,
      name: latest.name,
      protocol: latest.protocol ?? null,
      label: nicknames[id]?.trim() || latest.name,
      solves: list.length,
      dnfs: list.length - times.length,
      best: times.length ? Math.min(...times) : null,
      median: median(times),
      currentAo12: rolling[rolling.length - 1] ?? null,
      bestAo12: bestAverageOfN(list, 12),
      avgTps: tps.length ? tps.reduce((a, b) => a + b, 0) / tps.length : null,
      correctedRate: list.filter((s) => s.cube?.corrected).length / list.length,
      firstAt: list[0].date,
      lastAt: list[list.length - 1].date,
      comparable: times.length >= MIN_SOLVES_TO_COMPARE,
    });
  }
  cubes.sort((a, b) => b.lastAt - a.lastAt);

  return { cubes, untracked, notes: garageNotes(cubes) };
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function garageNotes(cubes: GarageCube[]): string[] {
  const notes: string[] = [];
  const comparable = cubes.filter((c) => c.comparable && c.median !== null);
  if (comparable.length >= 2) {
    const sorted = [...comparable].sort((a, b) => a.median! - b.median!);
    const fast = sorted[0];
    const slow = sorted[sorted.length - 1];
    const gap = (slow.median! - fast.median!) / slow.median!;
    if (gap >= MEANINGFUL_GAP) {
      notes.push(`Your median is ${pct(gap)} quicker on ${fast.label} than on ${slow.label} — though a cube you've used more, or more recently, will always look better.`);
    } else {
      notes.push(`No real speed difference between ${comparable.map((c) => c.label).join(" and ")} — their medians are within ${pct(MEANINGFUL_GAP)}.`);
    }
    const tpsCubes = comparable.filter((c) => c.avgTps !== null).sort((a, b) => b.avgTps! - a.avgTps!);
    if (tpsCubes.length >= 2 && tpsCubes[0].avgTps! / tpsCubes[tpsCubes.length - 1].avgTps! - 1 >= 0.08) {
      notes.push(`You turn faster on ${tpsCubes[0].label} (${tpsCubes[0].avgTps!.toFixed(1)} vs ${tpsCubes[tpsCubes.length - 1].avgTps!.toFixed(1)} turns/s on ${tpsCubes[tpsCubes.length - 1].label}).`);
    }
  }
  for (const c of cubes) {
    if (c.solves >= MIN_SOLVES_TO_COMPARE && c.correctedRate >= RELIABILITY_FLAG_RATE) {
      notes.push(`${c.label} lost a turn over Bluetooth in ${pct(c.correctedRate)} of its solves — worth a battery check, a fresh pairing, or a firmware update.`);
    }
  }
  return notes;
}
