import { beforeAll, describe, expect, it } from "vitest";
import { ensureSolverReady } from "@/lib/cube-engine/engine";
import { computeCorrectiveMoves } from "./scrambleVerify";
import { MIMIC_STABLE_MS, faceletsOf, fixAfter, mimicAlg, mimicSyncVerdict, mimicView, movesToReach } from "./mimicSync";

beforeAll(() => {
  ensureSolverReady();
});

const SCRAMBLE = "R U R' U' F2 D' L2 B R2 U2 F' L'";
const SOLVED = faceletsOf("");
const solverAsync = async (target: string, actual: string) => computeCorrectiveMoves(target, actual);

describe("mimicSyncVerdict", () => {
  const base = { unreliable: false, stableForMs: 0 };

  it("agrees when the mimic already shows the cube's state, however long it has been", () => {
    const f = faceletsOf(SCRAMBLE);
    expect(mimicSyncVerdict({ ...base, expected: f, facelets: f })).toBe("agree");
    expect(mimicSyncVerdict({ ...base, expected: f, facelets: f, stableForMs: 5000 })).toBe("agree");
    expect(mimicSyncVerdict({ ...base, expected: f, facelets: f, unreliable: true })).toBe("agree");
  });

  it("waits while a disagreement is new, then corrects once it has held for the stable period", () => {
    const expected = faceletsOf(SCRAMBLE);
    const facelets = faceletsOf(`${SCRAMBLE} R`);
    expect(mimicSyncVerdict({ ...base, expected, facelets })).toBe("wait");
    expect(mimicSyncVerdict({ ...base, expected, facelets, stableForMs: MIMIC_STABLE_MS - 1 })).toBe("wait");
    expect(mimicSyncVerdict({ ...base, expected, facelets, stableForMs: MIMIC_STABLE_MS })).toBe("correct");
  });

  it("never corrects while the cube's reports are flagged unreliable, however long they have disagreed", () => {
    const expected = faceletsOf(SCRAMBLE);
    const facelets = faceletsOf(`${SCRAMBLE} R`);
    expect(mimicSyncVerdict({ expected, facelets, unreliable: true, stableForMs: 60_000 })).toBe("unreliable");
  });

  it("does not trust a malformed state even when the flag has not caught up", () => {
    const expected = faceletsOf(SCRAMBLE);
    expect(mimicSyncVerdict({ expected, facelets: "UUUU", unreliable: false, stableForMs: 60_000 })).toBe("unreliable");
    expect(mimicSyncVerdict({ expected, facelets: "R".repeat(54), unreliable: false, stableForMs: 60_000 })).toBe("unreliable");
  });
});

describe("mimicView", () => {
  const tokens = ["R", "U", "F"];
  it("is just the scramble and the turns with no fix", () => {
    expect(mimicView(SCRAMBLE, tokens, null)).toEqual({ setupAlg: SCRAMBLE, liveMoves: tokens });
  });

  it("rides later turns on top of a fix and drops it when the turns or scramble no longer match", () => {
    const fix = fixAfter(SCRAMBLE, tokens, mimicAlg(SCRAMBLE, tokens), ["D", "L2"]);
    expect(fix.setup).toBe(`${SCRAMBLE} R U F D L2`);
    expect(mimicView(SCRAMBLE, tokens, fix)).toEqual({ setupAlg: fix.setup, liveMoves: [] });
    expect(mimicView(SCRAMBLE, [...tokens, "B'"], fix)).toEqual({ setupAlg: fix.setup, liveMoves: ["B'"] });
    // A new solve: fewer turns, other turns, or another scramble.
    expect(mimicView(SCRAMBLE, ["R"], fix).setupAlg).toBe(SCRAMBLE);
    expect(mimicView(SCRAMBLE, ["R", "U", "B"], fix).setupAlg).toBe(SCRAMBLE);
    expect(mimicView("F2 U", tokens, fix).setupAlg).toBe("F2 U");
  });
});

describe("movesToReach", () => {
  const cubeAfter = (alg: string) => faceletsOf(alg);

  it("brings the mimic from a lost-turn state to the cube's real one", async () => {
    const solution = "R U R' U' F2 D' L2 B R2 U2 F' L'".split(" ");
    // The cube really did every turn; the app lost the fourth.
    const recorded = solution.filter((_, i) => i !== 3);
    const shown = mimicAlg("", recorded);
    const moves = await movesToReach(shown, cubeAfter(solution.join(" ")), solverAsync);
    expect(moves.length).toBeGreaterThan(0);
    expect(cubeAfter(mimicAlg(shown, moves))).toBe(cubeAfter(solution.join(" ")));
  });

  it("can show solved at the finish when the lost turn was the one that solved it", async () => {
    const solve = "R U R' U'".split(" ");
    const scramble = solve.map((t) => (t.endsWith("'") ? t.slice(0, -1) : t.endsWith("2") ? t : `${t}'`)).reverse().join(" ");
    // The last turn (U') never reached the app, so the mimic shows one turn short of solved.
    const recorded = solve.slice(0, -1);
    const shown = mimicAlg(scramble, recorded);
    expect(cubeAfter(shown)).not.toBe(SOLVED);
    expect(mimicSyncVerdict({ expected: cubeAfter(shown), facelets: SOLVED, unreliable: false, stableForMs: MIMIC_STABLE_MS })).toBe("correct");
    const moves = await movesToReach(shown, SOLVED, solverAsync);
    const fix = fixAfter(scramble, recorded, shown, moves);
    const view = mimicView(scramble, recorded, fix);
    expect(cubeAfter(mimicAlg(view.setupAlg, view.liveMoves))).toBe(SOLVED);
    // And the mimic now agrees with the store, so nothing more is corrected.
    expect(mimicSyncVerdict({ expected: cubeAfter(mimicAlg(view.setupAlg, view.liveMoves)), facelets: SOLVED, unreliable: false, stableForMs: 10_000 })).toBe("agree");
  });

  it("returns nothing when the mimic already shows the state", async () => {
    const shown = mimicAlg(SCRAMBLE, ["R"]);
    expect(await movesToReach(shown, cubeAfter(shown), solverAsync)).toEqual([]);
  });
});
