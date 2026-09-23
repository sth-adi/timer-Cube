import { describe, expect, it } from "vitest";
import { analyzeTempo, phaseLabels } from "./tempo";
import { Cube } from "@/lib/cube-engine/engine";

describe("analyzeTempo", () => {
  it("scores a perfectly metronomic solve", () => {
    const r = analyzeTempo([0, 500, 1000, 1500, 2000], 120)!;
    expect(r.smoothness).toBe(1);
    expect(r.counts.perfect).toBe(5);
    expect(r.gaps).toEqual([]);
    expect(r.suggestedBpm).toBe(130);
  });

  it("finds missed beats and pins them on the phase", () => {
    // beats 0,1,2 then silence for beats 3-5, then 6,7
    const r = analyzeTempo([0, 500, 1000, 3000, 3500], 120, ["Cross", "Cross", "Cross", "F2L", "F2L"])!;
    expect(r.beats).toBe(8);
    expect(r.gaps).toEqual([{ fromBeat: 3, beats: 3, phase: "F2L" }]);
    expect(r.missedByPhase).toEqual({ F2L: 3 });
    expect(r.smoothness).toBeCloseTo(5 / 8);
    expect(r.suggestedBpm).toBe(110);
  });

  it("judges early and late turns", () => {
    const r = analyzeTempo([0, 540, 900], 120)!;
    expect(r.turns.map((t) => t.judgement)).toEqual(["perfect", "perfect", "good"]);
    expect(r.turns[2].offsetMs).toBe(-100);
    const off = analyzeTempo([0, 700], 120)!;
    expect(off.turns[1].judgement).toBe("off");
  });

  it("returns null with no turns", () => {
    expect(analyzeTempo([], 120)).toBeNull();
  });
});

describe("phaseLabels", () => {
  it("labels every move with the phase it was made in", () => {
    const start = new Cube();
    start.move("F");
    const labels = phaseLabels(start.asString(), ["F'", "R", "R'"]);
    expect(labels[0]).toBe("Cross");
    expect(labels[1]).toBe("PLL"); // solved after F' — nothing left but "PLL"
  });
});
