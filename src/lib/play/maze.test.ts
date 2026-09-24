import { describe, expect, it } from "vitest";
import { BALL_R, generateMaze, levelSpec, solidRects, solvePath, stepBall, type Ball, type GateColor } from "./maze";

describe("Tilt Maze", () => {
  it("generates a perfect maze: every cell reachable, reproducible from the seed", () => {
    const m = generateMaze(6, 8, 123, 3, 2);
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) expect(solvePath(m, { c: 0, r: 0 }, { c, r }).length).toBeGreaterThan(0);
    const again = generateMaze(6, 8, 123, 3, 2);
    expect(again.east).toEqual(m.east);
    expect(again.gates).toEqual(m.gates);
  });

  it("puts every gate on the true path, in distinct face colors, and never a hole on it", () => {
    const m = generateMaze(7, 9, 99, 4, 5);
    expect(m.gates).toHaveLength(4);
    expect(new Set(m.gates.map((g) => g.color)).size).toBe(4);
    const path = new Set(solvePath(m, { c: 0, r: 0 }, m.exit).map((p) => `${p.c},${p.r}`));
    for (const g of m.gates) expect(path.has(`${g.c},${g.r}`)).toBe(true);
    for (const h of m.holes) expect(path.has(`${Math.floor(h.x)},${Math.floor(h.y)}`)).toBe(false);
  });

  it("a shut gate is solid and an open one isn't", () => {
    const m = generateMaze(6, 8, 7, 2, 0);
    const shut = solidRects(m, new Set());
    const open = solidRects(m, new Set<GateColor>(m.gates.map((g) => g.color)));
    expect(shut.length - open.length).toBe(2);
    expect(shut.filter((r) => r.gate).length).toBe(2);
  });

  it("rolls downhill, never passes through a wall, and reports the win", () => {
    // A 1×3 corridor straight down to the exit: tilting toward the user rolls the marble out.
    const m = generateMaze(1, 3, 1, 0, 0);
    const rects = solidRects(m, new Set());
    let ball: Ball = { ...m.start, vx: 0, vy: 0 };
    let event = "none";
    for (let i = 0; i < 400 && event !== "won"; i++) {
      ({ ball, event } = stepBall(m, rects, ball, { x: 0.3, y: 1 }, 1 / 60));
      expect(ball.x).toBeGreaterThanOrEqual(BALL_R - 0.1);
      expect(ball.x).toBeLessThanOrEqual(1 - BALL_R + 0.1);
    }
    expect(event).toBe("won");
  });

  it("a hole sends the marble back to the start", () => {
    const m = { ...generateMaze(3, 3, 5, 0, 0), holes: [{ x: 0.5, y: 1.5 }] };
    const rects = solidRects(m, new Set());
    let ball: Ball = { x: 0.5, y: 1.2, vx: 0, vy: 2 };
    let event = "none";
    for (let i = 0; i < 60 && event === "none"; i++) ({ ball, event } = stepBall(m, rects, ball, { x: 0, y: 0 }, 1 / 60));
    expect(event).toBe("fell");
    expect(ball).toMatchObject({ x: 0.5, y: 0.5, vx: 0, vy: 0 });
  });

  it("scales difficulty with level", () => {
    expect(levelSpec(1).gates).toBe(1);
    expect(levelSpec(6).w).toBeGreaterThan(levelSpec(1).w);
    expect(levelSpec(8).holes).toBeGreaterThan(0);
  });
});
