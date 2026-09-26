import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { bottomLayerSolved, orientationSolved } from "@/lib/solvers/oll";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { invertMoves } from "@/lib/xray/common";
import type { CaseProfile } from "@/lib/xray/algMicroscope";
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

export interface DetectedVariant {
  alg: string;
  count: number;
  meanExecMs: number;
  bestExecMs: number;
}

/** Per case, the algorithms you've actually executed, most used first. */
export function detectMyAlgs(cases: readonly CaseProfile[]): Record<string, DetectedVariant[]> {
  const out: Record<string, DetectedVariant[]> = {};
  for (const c of cases) {
    out[myAlgKey(c.step, c.caseName)] = c.variants.map((v) => ({ alg: v.alg, count: v.count, meanExecMs: v.meanExecMs, bestExecMs: v.bestExecMs }));
  }
  return out;
}

/** The algorithm to use for a case: your chosen one if you've picked one, else the book's. */
export function effectiveAlg(chosen: Readonly<Record<string, string>> | undefined, group: AlgGroup, name: string, bookAlg: string): string {
  return chosen?.[myAlgKey(group, name)] ?? bookAlg;
}
