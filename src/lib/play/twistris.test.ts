import { describe, expect, it } from "vitest";
import { COLS, ROWS, apply, cells, ghost, hardDrop, hold, newGame, rotate, shift, type Game } from "./twistris";

describe("Twistris", () => {
  it("deals every piece exactly once per 7-bag, reproducibly from a seed", () => {
    const a = newGame(42);
    const b = newGame(42);
    expect([a.active.type, ...a.queue.slice(0, 6)].sort()).toEqual(["I", "J", "L", "O", "S", "T", "Z"]);
    expect([a.active.type, ...a.queue]).toEqual([b.active.type, ...b.queue]);
  });

  it("stops at the walls and rotates back to where it started after four turns", () => {
    let g = newGame(1);
    for (let i = 0; i < 20; i++) g = shift(g, -1);
    expect(Math.min(...cells(g.active).map(([x]) => x))).toBe(0);
    const start = cells(g.active);
    let r = g;
    for (let i = 0; i < 4; i++) r = rotate(r, 1);
    if (r.active.x === g.active.x) expect(cells(r.active).sort()).toEqual([...start].sort());
  });

  it("hard-drops to the ghost position and locks the piece into the board", () => {
    const g = newGame(7);
    const landing = cells(ghost(g));
    const after = hardDrop(g);
    for (const [x, y] of landing) expect(after.board[y][x]).not.toBe(0);
    expect(after.score).toBeGreaterThan(0);
  });

  it("clears a full row and scores it", () => {
    const g0 = newGame(3);
    const board = g0.board.map((r) => [...r]);
    board[ROWS - 1] = Array(COLS).fill(1);
    board[ROWS - 1][0] = 0;
    // An upright I dropped into the one gap.
    const g: Game = { ...g0, board, active: { type: "I", rot: 1, x: -2, y: 0 } };
    const after = hardDrop(g);
    expect(after.lines).toBe(1);
    expect(after.lastClear).toEqual([ROWS - 1]);
    // The rest of the upright I drops into the cleared row: one cell at column 0.
    expect(after.board[ROWS - 1].filter((c) => c !== 0).length).toBe(1);
  });

  it("holds once per piece", () => {
    const g = newGame(9);
    const first = g.active.type;
    const held = hold(g);
    expect(held.hold).toBe(first);
    expect(hold(held)).toBe(held);
  });

  it("ends the game when the stack tops out", () => {
    let g = newGame(5);
    for (let i = 0; i < 200 && !g.over; i++) g = apply(g, "drop");
    expect(g.over).toBe(true);
  });
});
