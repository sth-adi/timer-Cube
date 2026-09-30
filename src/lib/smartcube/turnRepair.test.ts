import { describe, expect, it } from "vitest";
import { cubeFromAlg } from "../cube-engine/engine";
import { repairLostTurns } from "./turnRepair";

/** A solve of `scramble` that's just its inverse — every turn is a real, reported one. */
function solveOf(scramble: string): string[] {
  return scramble
    .split(" ")
    .reverse()
    .map((t) => (t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`));
}
const timesFor = (n: number) => Array.from({ length: n }, (_, i) => i * 100);
const solves = (scramble: string, tokens: readonly string[]) => cubeFromAlg(`${scramble} ${tokens.join(" ")}`).isSolved();

const SCRAMBLES = [
  "R U R' U' F2 D' L2 B R2 U2 F' L D",
  "B2 L' D2 R F U' L2 D B' R' U2 F2 L",
  "U F2 L' D B2 R U' F D2 L R' B U2 F'",
];

describe("repairLostTurns", () => {
  it("says so when the turns already solve it", () => {
    const s = SCRAMBLES[0];
    const t = solveOf(s);
    expect(repairLostTurns(s, t, timesFor(t.length))).toBe("intact");
  });

  it("puts back any single lost turn, wherever it was, and the result solves the scramble", () => {
    for (const s of SCRAMBLES) {
      const full = solveOf(s);
      for (let drop = 0; drop < full.length; drop++) {
        const tokens = full.filter((_, i) => i !== drop);
        const r = repairLostTurns(s, tokens, timesFor(tokens.length));
        expect(r, `${s} drop ${drop}`).not.toBeNull();
        expect(r).not.toBe("intact");
        if (!r || r === "intact") continue;
        expect(solves(s, r.tokens), `${s} drop ${drop}`).toBe(true);
        expect(r.tokens).toHaveLength(full.length);
        expect(r.change.kind).toBe("inserted");
        expect(r.times).toHaveLength(r.tokens.length);
      }
    }
  });

  it("recovers exactly the turn that was lost, when it can't have been anywhere else", () => {
    const s = SCRAMBLES[1];
    const full = solveOf(s);
    const drop = 5;
    const tokens = full.filter((_, i) => i !== drop);
    const r = repairLostTurns(s, tokens, timesFor(tokens.length));
    expect(r && r !== "intact" && r.tokens.join(" ")).toBe(full.join(" "));
  });

  it("puts back two turns lost together", () => {
    const s = SCRAMBLES[0];
    const full = solveOf(s);
    const tokens = [...full.slice(0, 4), ...full.slice(6)];
    const r = repairLostTurns(s, tokens, timesFor(tokens.length));
    expect(r).not.toBeNull();
    if (r && r !== "intact") {
      expect(solves(s, r.tokens)).toBe(true);
      expect(r.change.tokens.length).toBeLessThanOrEqual(2);
    }
  });

  it("removes a turn the cube reported twice", () => {
    const s = SCRAMBLES[2];
    const full = solveOf(s);
    const tokens = [...full.slice(0, 6), full[5], ...full.slice(6)]; // an echo
    const r = repairLostTurns(s, tokens, timesFor(tokens.length));
    expect(r).not.toBeNull();
    if (r && r !== "intact") {
      expect(solves(s, r.tokens)).toBe(true);
      expect(r.tokens).toHaveLength(full.length);
    }
  });

  it("keeps times ordered, with a recovered turn inside its gap", () => {
    const s = SCRAMBLES[0];
    const full = solveOf(s);
    const tokens = full.filter((_, i) => i !== 6);
    const times = timesFor(tokens.length);
    const r = repairLostTurns(s, tokens, times);
    expect(r && r !== "intact").toBe(true);
    if (r && r !== "intact") {
      for (let i = 1; i < r.times.length; i++) expect(r.times[i]).toBeGreaterThanOrEqual(r.times[i - 1]);
      const at = r.change.index;
      expect(r.times[at]).toBeGreaterThan(times[at - 1]);
      expect(r.times[at]).toBeLessThan(times[at]);
    }
  });

  it("gives up when more was lost than one place can explain", () => {
    const s = SCRAMBLES[0];
    const full = solveOf(s);
    // Three turns gone from three separate places.
    const tokens = full.filter((_, i) => ![1, 6, 10].includes(i));
    expect(repairLostTurns(s, tokens, timesFor(tokens.length))).toBeNull();
  });

  it("copes with recorded half turns and an empty solve", () => {
    const s = "R2 U2 F2";
    const full = solveOf(s); // F2 U2 R2
    const tokens = full.slice(1);
    const r = repairLostTurns(s, tokens, timesFor(tokens.length));
    expect(r && r !== "intact" && solves(s, r.tokens)).toBe(true);
    expect(repairLostTurns(s, [], [])).toBeNull();
  });
});
