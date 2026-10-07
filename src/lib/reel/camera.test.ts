import { describe, expect, it } from "vitest";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { invertMoves } from "@/lib/xray/common";
import { reelViewInto } from "./camera";
import { buildReelTimeline } from "./timeline";

const moves = toPhysicalTurns("R U R' U' R' F R2 U' R' U' R U R' F'", HOME_ORIENTATION).turns;
const times = moves.map((_, i) => 1000 + i * 600);
const tl = buildReelTimeline(invertMoves(moves).join(" "), moves, times, times[times.length - 1]);

const view = (t: number, settle = 0) => {
  const out = new Float64Array(9);
  reelViewInto(out, tl, t, settle);
  return Array.from(out);
};
const apart = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

describe("reel camera lean", () => {
  it("rests before the first turn and well after the last", () => {
    const rest = view(0);
    expect(apart(view(-Infinity), rest)).toBe(0);
    expect(apart(view(times[times.length - 1] + 3000), rest)).toBeLessThan(1e-9);
  });

  it("swings a few degrees toward a turn, never more", () => {
    const rest = view(0);
    let widest = 0;
    for (let t = 900; t < times[times.length - 1]; t += 25) widest = Math.max(widest, apart(view(t), rest));
    expect(widest).toBeGreaterThan(0.02);
    // A matrix entry moves by at most the rotation angle in radians: 8 degrees is 0.14.
    expect(widest).toBeLessThan(0.15);
  });

  it("is the same camera however it is reached", () => {
    const a = view(2500);
    view(100);
    view(9000);
    expect(view(2500)).toEqual(a);
  });

  it("is a rotation and stays one", () => {
    const m = view(2500);
    for (let r = 0; r < 3; r++) expect(Math.hypot(m[r * 3], m[r * 3 + 1], m[r * 3 + 2])).toBeCloseTo(1, 9);
  });

  it("lets go on the end card", () => {
    const settled = view(2500, 1);
    expect(apart(settled, view(0, 1))).toBeLessThan(1e-9);
  });
});
