/**
 * Pure aggregation behind the "Heat cube": how often each face is turned and how slowly, from the solves
 * already on disk, boiled down to a handful of ramp steps per face. The card draws these on a 3D cube;
 * nothing here knows about colour, only about which step (0 = least, steps-1 = most) a face lands on.
 */

import type { Solve } from "@/types";
import { computeFaceSpeedFingerprint } from "@/lib/analysis/smartCubeInsights";
import { FACES_IN_ORDER, type Face } from "@/lib/cube-engine/stickerTurns";

export type HeatMode = "often" | "slow";

/** Ramp steps the cube is painted in: five reads cleanly as an ordinal scale, and matches --heat-1..5. */
export const HEAT_STEPS = 5;
/** Under this many face turns the picture is noise, so the card stays hidden. */
export const MIN_HEAT_TURNS = 60;
/** A face needs this many timed turns before its speed is trusted. */
export const MIN_SPEED_TURNS = 5;
/** "How slow" needs at least this many faces with a trusted speed, or the ramp has nothing to compare. */
export const MIN_SPEED_FACES = 3;

export interface FaceHeat {
  face: Face;
  /** Every turn of this face in the reconstructions (quarter, half, wide: each counts once). */
  turns: number;
  /** Share of all face turns, 0..1. */
  share: number;
  /** Mean ms per turn while turning (pauses excluded), or null without enough timed turns. */
  avgGapMs: number | null;
}

export interface HeatCubeData {
  faces: FaceHeat[];
  totalTurns: number;
  /** True when enough faces carry a trusted speed for the "how slow" view. */
  hasSpeed: boolean;
}

const FACE_SET: ReadonlySet<string> = new Set(FACES_IN_ORDER);

/** The face a move token turns ("R'", "U2", "Rw", "r" are all faces; "x", "M" are not), or null. */
export function faceOfToken(token: string): Face | null {
  const letter = token[0]?.toUpperCase();
  return letter && FACE_SET.has(letter) ? (letter as Face) : null;
}

/** Turn counts per face over every solve that kept a reconstruction. */
export function countFaceTurns(solves: readonly Solve[]): Record<Face, number> {
  const counts: Record<Face, number> = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
  for (const solve of solves) {
    if (!solve.reconstruction) continue;
    for (const token of solve.reconstruction.trim().split(/\s+/)) {
      const face = token ? faceOfToken(token) : null;
      if (face) counts[face] += 1;
    }
  }
  return counts;
}

export function computeHeatCube(solves: readonly Solve[]): HeatCubeData {
  const counts = countFaceTurns(solves);
  const totalTurns = FACES_IN_ORDER.reduce((n, f) => n + counts[f], 0);
  const speed = new Map(computeFaceSpeedFingerprint(solves).map((s) => [s.face, s]));
  const faces = FACES_IN_ORDER.map((face): FaceHeat => {
    const s = speed.get(face);
    return {
      face,
      turns: counts[face],
      share: totalTurns > 0 ? counts[face] / totalTurns : 0,
      avgGapMs: s && s.turnCount >= MIN_SPEED_TURNS ? s.avgGapMs : null,
    };
  });
  return { faces, totalTurns, hasSpeed: faces.filter((f) => f.avgGapMs !== null).length >= MIN_SPEED_FACES };
}

/** Whether there is enough to draw at all. */
export function hasEnoughHeat(data: HeatCubeData): boolean {
  return data.totalTurns >= MIN_HEAT_TURNS && data.faces.filter((f) => f.turns > 0).length >= 3;
}

/** The step (0..steps-1) of `value` between `min` and `max`, in equal-width bins; a flat range lands mid-ramp. */
export function heatStep(value: number, min: number, max: number, steps = HEAT_STEPS): number {
  if (!(max > min)) return Math.floor(steps / 2);
  return Math.min(steps - 1, Math.max(0, Math.floor(((value - min) / (max - min)) * steps)));
}

export interface HeatView {
  /** Step per face, or null where the face has no data in this mode. */
  steps: Record<Face, number | null>;
  /** The value range the ramp spans (share 0..1 for "often", ms for "slow"); null with nothing to span. */
  range: { min: number; max: number } | null;
}

export function heatView(data: HeatCubeData, mode: HeatMode): HeatView {
  const value = (f: FaceHeat): number | null => (mode === "often" ? (f.turns > 0 ? f.share : null) : f.avgGapMs);
  const present = data.faces.map(value).filter((v): v is number => v !== null);
  const steps: Record<Face, number | null> = { U: null, R: null, F: null, D: null, L: null, B: null };
  if (present.length === 0) return { steps, range: null };
  const min = Math.min(...present);
  const max = Math.max(...present);
  for (const f of data.faces) {
    const v = value(f);
    steps[f.face] = v === null ? null : heatStep(v, min, max);
  }
  return { steps, range: { min, max } };
}

/** The 54 sticker fills for a cube whose face `f` is painted `paint(f)`, in facelet order (nine per face). */
export function stickerFills(paint: (face: Face) => string): string[] {
  return FACES_IN_ORDER.flatMap((face) => Array.from({ length: 9 }, () => paint(face)));
}
