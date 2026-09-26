import { describe, expect, it } from "vitest";
import { invertMoves } from "@/lib/xray/common";
import { ghostFromShared, ghostFromText, ghostMilestones, ghostTurnsAt, raceGap, sharedIdFrom } from "./ghost";

describe("ghost sources", () => {
  it("reads a pasted reconstruction with rotations and wide turns", () => {
    // Scramble is the inverse of the solution, so the solution solves it.
    const g = ghostFromText("F R U R' U' F'\n// solve\nF R U R' U' F'", 3);
    expect("error" in g).toBe(true); // F R U R' U' F' twice doesn't solve — sanity check the validation
    const ok = ghostFromText("F U R U' R' F'\nF R U R' U' F'", 3);
    expect("error" in ok).toBe(false);
    if ("error" in ok) return;
    expect(ok.moves).toHaveLength(6);
    expect(ok.timesMs).toEqual([500, 1000, 1500, 2000, 2500, 3000]);
    expect(ok.evenlyPaced).toBe(true);
  });

  it("follows whole-cube rotations in a pasted solution", () => {
    // After y the old back face is on the right, so y R y' is a physical B.
    const ok = ghostFromText("B'\ny R y'", 1);
    expect("error" in ok ? ok.error : ok.moves).toEqual(["B"]);
  });

  it("rejects bad input with a reason", () => {
    expect(ghostFromText("R U", 5)).toHaveProperty("error");
    expect(ghostFromText("R\nR", 0)).toHaveProperty("error");
  });

  it("takes a shared solve's own timing when it has it", () => {
    const scramble = "R U R' U'";
    const reconstruction = invertMoves(scramble.split(" ")).join(" ");
    const g = ghostFromShared({ scramble, reconstruction, timeMs: 2000, moveTimestamps: [100, 400, 900, 2000], puzzle: "333", event: null, username: "sam" });
    expect("error" in g ? g.error : g.timesMs).toEqual([100, 400, 900, 2000]);
    expect("error" in g ? "" : g.label).toBe("sam's 2.00");
  });

  it("pulls the id out of a shared link", () => {
    expect(sharedIdFrom("https://example.com/solve/AbC123xyz9")).toBe("AbC123xyz9");
    expect(sharedIdFrom("AbC123xyz9")).toBe("AbC123xyz9");
    expect(sharedIdFrom("not a link")).toBeNull();
  });
});

describe("race", () => {
  it("plays the ghost's turns at its own times", () => {
    const g = ghostFromText("F U R U' R' F'\nF R U R' U' F'", 3);
    if ("error" in g) throw new Error(g.error);
    expect(ghostTurnsAt(g, 0)).toBe(0);
    expect(ghostTurnsAt(g, 1000)).toBe(2);
    expect(ghostTurnsAt(g, 99999)).toBe(6);
    const m = ghostMilestones(g);
    expect(m[m.length - 1]).toBe(3000);
  });

  it("reads the gap at the last milestone both sides reached", () => {
    const ghost = [1000, 2000, 3000, null, null, null, null];
    const mine = [800, 2500, null, null, null, null, null];
    const gap = raceGap(ghost, mine, 3100);
    expect(gap).toMatchObject({ mine: 2, ghost: 3, milestone: "Pair 1", deltaMs: 500 });
    expect(gap.line).toBe("0.50s behind at Pair 1");
    expect(raceGap(ghost, [800, null, null, null, null, null, null], 1200).line).toBe("0.20s ahead at Cross");
    expect(raceGap(ghost, [null, null, null, null, null, null, null], 1200).line).toBe("Ghost reached Cross first");
  });
});
