import { describe, expect, it } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import { apply } from "@/lib/gyro/orientation";
import { layerRotation, stickers3d } from "./cube3d";
import { buildReelTimeline, frameAt, rollingTps } from "./timeline";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";
import { invertMoves, slotGrip } from "@/lib/xray/common";

const key = (v: readonly number[]) => v.map((x) => Math.round(x)).join(",");

describe("cube3d", () => {
  it("places stickers so a full layer turn matches the engine's own turn, for every face and direction", () => {
    const solved = newCube().asString();
    for (const token of ["U", "R", "F", "D", "L", "B", "U'", "R2", "F'", "D2", "L'", "B'"]) {
      const { axis, m } = layerRotation(token, 1);
      // Rotate the solved cube's layer stickers geometrically…
      const rotated = new Map<string, string>();
      for (const s of stickers3d(solved)) {
        const inLayer = s.cubie[0] * axis[0] + s.cubie[1] * axis[1] + s.cubie[2] * axis[2] > 0.5;
        const c = inLayer ? apply(m, s.cubie) : s.cubie;
        const n = inLayer ? apply(m, s.normal) : s.normal;
        rotated.set(`${key(c)}|${key(n)}`, s.color);
      }
      // …and compare with the engine's facelets after that move.
      const cube = newCube();
      cube.move(token);
      for (const s of stickers3d(cube.asString())) {
        expect(rotated.get(`${key(s.cubie)}|${key(s.normal)}`), token).toBe(s.color);
      }
    }
  });
});

describe("reel timeline", () => {
  const moves = [
    ...toPhysicalTurns("U R U' R'", slotGrip(0)).turns,
    ...toPhysicalTurns("U R U R' U R U2 R'", HOME_ORIENTATION).turns,
    ...toPhysicalTurns("R U R' U' R' F R2 U' R' U' R U R' F' U2", HOME_ORIENTATION).turns,
  ];
  const times = moves.map((_, i) => i * 150);
  const tl = buildReelTimeline(invertMoves(moves).join(" "), moves, times, times[times.length - 1]);

  it("finds the phases with their cases and ends on the final time", () => {
    const labels = tl.phases.map((p) => p.label);
    expect(labels).toContain("OLL · Sune");
    expect(labels[labels.length - 1]).toBe("PLL · T Perm");
    expect(tl.phases[tl.phases.length - 1].endMs).toBe(tl.totalMs);
    expect(tl.phases.reduce((s, p) => s + p.splitMs, 0)).toBe(tl.totalMs);
    expect(tl.facelets[tl.facelets.length - 1]).toBe(newCube().asString());
  });

  it("knows which move is turning at any instant", () => {
    expect(frameAt(tl, 0).done).toBe(1);
    const mid = frameAt(tl, 150 - 50);
    expect(mid.done).toBe(1);
    expect(mid.turning?.index).toBe(1);
    expect(mid.turning!.progress).toBeGreaterThan(0.4);
    expect(frameAt(tl, tl.totalMs + 1).done).toBe(moves.length);
    expect(rollingTps(tl, 1000)).toBe(6);
  });
});
