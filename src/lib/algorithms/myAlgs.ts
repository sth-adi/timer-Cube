import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { invertMoves } from "@/lib/xray/common";
import { canonicalAlg, mergeTurns, type AlgExecution } from "@/lib/xray/algMicroscope";
import type { AlgGroup } from "./types";

/**
 * My Algs: the algorithms *you* use, not the book's. The X-Ray already
 * sees which algorithm you executed for every OLL and PLL in your
 * smart-cube solves; this turns that into a personal alg sheet — pick
 * your main algorithm per case (one you've been doing, or any you type),
 * checked against the case itself, and the rest of the app (the Alg Gym,
 * the Sat-Nav, Learn mode) uses it instead of the book algorithm.
 *
 * Notation is yellow on top, green in front — the grip every algorithm
 * in the library assumes. Engine frame underneath (last layer on D).
 */

export const myAlgKey = (group: AlgGroup, name: string) => `${group}:${name}`;

const AUFS = [[], ["D"], ["D2"], ["D'"]] as const;

function applied(cube: CubeJSInstance, turns: readonly string[]): CubeJSInstance {
  const c = cube.clone();
  if (turns.length) c.move(turns.join(" "));
  return c;
}

const turnsOf = (alg: string) => toPhysicalTurns(alg, HOME_ORIENTATION).turns;

/** Whether `alg` solves the step for the case the book algorithm defines, from some angle of the top layer. */
export function solvesCase(group: AlgGroup, bookAlg: string, alg: string): boolean {
  let turns: string[];
  try {
    turns = turnsOf(alg);
    if (!turns.length) return false;
  } catch {
    return false;
  }
  const caseState = applied(newCube(), invertMoves(turnsOf(bookAlg)));
  for (const pre of AUFS) {
    const c = applied(caseState, [...pre, ...turns]);
    if (group === "OLL" ? bottomLayerSolved(c) && orientationSolved(c) : AUFS.some((post) => applied(c, [...post]).isSolved())) return true;
  }
  return false;
}

/** The algorithm to use for a case: your chosen one if you've picked one, else the book's. */
export function effectiveAlg(chosen: Readonly<Record<string, string>> | undefined, group: AlgGroup, name: string, bookAlg: string): string {
  return chosen?.[myAlgKey(group, name)] ?? bookAlg;
}

const YELLOW_TOP_AUF: Record<string, string> = { D: "U", D2: "U2", "D'": "U'" };

/**
 * `alg` written to start from the same angle as the book's case (and, for
 * a PLL, to finish solved): the top-layer turn it needs before (and after)
 * added in yellow-top notation. Null if it doesn't solve the case at all.
 */
export function alignToCase(group: AlgGroup, bookAlg: string, alg: string): string | null {
  let turns: string[];
  try {
    turns = turnsOf(alg);
  } catch {
    return null;
  }
  const caseState = applied(newCube(), invertMoves(turnsOf(bookAlg)));
  for (const pre of AUFS) {
    const c = applied(caseState, [...pre, ...turns]);
    if (group === "OLL") {
      if (bottomLayerSolved(c) && orientationSolved(c)) return [pre[0] ? YELLOW_TOP_AUF[pre[0]] : "", alg].filter(Boolean).join(" ");
      continue;
    }
    for (const post of AUFS) {
      if (applied(c, [...post]).isSolved()) return [pre[0] ? YELLOW_TOP_AUF[pre[0]] : "", alg, post[0] ? YELLOW_TOP_AUF[post[0]] : ""].filter(Boolean).join(" ");
    }
  }
  return null;
}

// ---- Learning your algorithms from your solves ----

/**
 * One way of writing an algorithm, so the same algorithm reads the same:
 * physical turns, quarter turns merged, the top-layer turns at either end
 * (the AUFs) dropped, and turned about the vertical so it starts on R.
 * Null for anything that isn't valid notation.
 */
export function normalizedAlg(alg: string): string | null {
  let turns: string[];
  try {
    turns = turnsOf(alg);
  } catch {
    return null;
  }
  const merged = mergeTurns(turns).tokens;
  let a = 0;
  let b = merged.length;
  while (a < b && merged[a][0] === "D") a++;
  while (b > a && merged[b - 1][0] === "D") b--;
  const core = merged.slice(a, b);
  return core.length ? canonicalAlg(core).join(" ") : null;
}

export function sameAlg(a: string, b: string): boolean {
  const x = normalizedAlg(a);
  return x !== null && x === normalizedAlg(b);
}

/** An algorithm you've executed for a case, in one look and cleanly. */
export interface SeenAlg {
  alg: string;
  count: number;
  meanExecMs: number;
  bestExecMs: number;
  firstSeen: number;
  lastSeen: number;
  /** It's the library's own algorithm (however you wrote or angled it). */
  book: boolean;
}

/** An algorithm seen for the first time as one of yours — worth telling you about. */
export interface NewAlg {
  key: string;
  group: AlgGroup;
  caseName: string;
  alg: string;
  at: number;
}

/**
 * Folds executions into what you've been seen doing per case. Only clean,
 * one-look executions count: a two-look OLL is two algorithms, not a
 * new one, and a fumbled turn isn't part of anybody's algorithm.
 */
export function learnFromExecutions(
  seen: Readonly<Record<string, SeenAlg[]>>,
  executions: readonly AlgExecution[],
  bookAlg: (group: AlgGroup, name: string) => string | undefined,
): { seen: Record<string, SeenAlg[]>; fresh: NewAlg[] } {
  const next: Record<string, SeenAlg[]> = { ...seen };
  const fresh: NewAlg[] = [];
  for (const e of executions) {
    if (!e.oneLook || !e.clean) continue;
    const book = bookAlg(e.step, e.caseName);
    const norm = normalizedAlg(e.mergedAlg);
    if (!book || !norm) continue;
    const key = myAlgKey(e.step, e.caseName);
    const list = [...(next[key] ?? [])];
    const i = list.findIndex((x) => normalizedAlg(x.alg) === norm);
    if (i >= 0) {
      const x = list[i];
      list[i] = {
        ...x,
        count: x.count + 1,
        meanExecMs: (x.meanExecMs * x.count + e.executionMs) / (x.count + 1),
        bestExecMs: Math.min(x.bestExecMs, e.executionMs),
        firstSeen: Math.min(x.firstSeen, e.date),
        lastSeen: Math.max(x.lastSeen, e.date),
      };
    } else {
      const isBook = normalizedAlg(book) === norm;
      // Written from the book's angle, so it plays from the case as the library shows it — and a guard against a misread: it has to really solve this case.
      const aligned = isBook ? book : alignToCase(e.step, book, e.mergedAlg);
      if (!aligned) continue;
      list.push({ alg: aligned, count: 1, meanExecMs: e.executionMs, bestExecMs: e.executionMs, firstSeen: e.date, lastSeen: e.date, book: isBook });
      if (!isBook) fresh.push({ key, group: e.step, caseName: e.caseName, alg: aligned, at: e.date });
    }
    next[key] = list.sort((a, b) => b.count - a.count || a.meanExecMs - b.meanExecMs);
  }
  return { seen: next, fresh };
}

/** Times you need to have done an algorithm before it becomes your main one for the case. */
export const MAIN_AFTER = 2;

/** Your main algorithm for a case, from what you actually do: the one you use most, if it isn't the book's. */
export function autoMainAlg(list: readonly SeenAlg[] | undefined, dismissed: readonly string[] = []): string | null {
  const live = (list ?? []).filter((x) => !dismissed.includes(normalizedAlg(x.alg) ?? ""));
  const top = live[0];
  if (!top || top.book || top.count < MAIN_AFTER) return null;
  return top.alg;
}
