import { describe, expect, it } from "vitest";
import { diagnoseBld } from "./doctor";
import { invertMoves } from "@/lib/xray/common";
import { toPhysicalTurns } from "@/lib/smartcube/route";
import { HOME_ORIENTATION } from "@/lib/gyro/orientation";

const T_PERM = toPhysicalTurns("R U R' U' R' F R2 U' R' U' R U R' F'", HOME_ORIENTATION).turns;
/** Twists two white corners in place (a classic twist commutator). */
const TWIST = "R' D' R D R' D' R D U D' R' D R D' R' D R U'".split(" ");

function timed(chunks: string[][]) {
  const moves: string[] = [];
  const times: number[] = [];
  let t = 0;
  chunks.forEach((chunk, c) => {
    if (c > 0) t += 900;
    for (const m of chunk) {
      moves.push(m);
      times.push(t);
      t += 120;
    }
  });
  return { moves, times };
}

describe("diagnoseBld", () => {
  it("reports a clean solve", () => {
    const body = ["R", "U", "F'", "L2", "D"];
    const { moves, times } = timed([body.slice(0, 2), body.slice(2)]);
    const d = diagnoseBld(invertMoves(body).join(" "), moves, times);
    expect(d.solved).toBe(true);
    expect(d.verdict).toBe("Solved!");
    expect(d.chunks).toHaveLength(2);
    expect(d.chunks[1].solvedAfter).toBe(20);
  });

  it("spots unfixed parity", () => {
    const x = ["R", "U2", "F", "D'", "L"];
    const scramble = invertMoves([...x, ...T_PERM]).join(" ");
    const { moves, times } = timed([x]);
    const d = diagnoseBld(scramble, moves, times);
    expect(d.verdict).toBe("Parity wasn't fixed");
    expect(d.unsolved.filter((u) => u.issue === "misplaced")).toHaveLength(4);
  });

  it("spots corners twisted in place", () => {
    const d = diagnoseBld(invertMoves(TWIST).join(" "), [], []);
    expect(d.verdict).toBe("2 corners twisted in place");
    expect(d.unsolved.every((u) => u.issue === "twisted" && u.piece.kind === "corner")).toBe(true);
    expect(d.unsolved[0].piece.letter).toMatch(/^[A-X]$/);
  });

  it("pins down the chunk that broke things", () => {
    const { moves, times } = timed([["R'"], ["U"]]);
    const d = diagnoseBld("R", moves, times);
    expect(d.chunks[0].solvedAfter).toBe(20);
    expect(d.firstBadChunk).toBe(1);
    expect(d.unsolved.every((u) => u.brokenInChunk === 1)).toBe(true);
  });

  it("flags pieces that were never solved", () => {
    const d = diagnoseBld("R", [], []);
    expect(d.unsolved.every((u) => u.brokenInChunk === null)).toBe(true);
    expect(d.firstBadChunk).toBeNull();
  });
});
