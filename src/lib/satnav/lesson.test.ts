import { describe, expect, it } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import { recapLine, stageProgress } from "./lesson";

describe("stageProgress", () => {
  it("reads a solved cube as every stage complete", () => {
    const c = newCube();
    for (const stage of ["cross", "f2l", "oll", "pll", "auf"] as const) {
      const p = stageProgress(c, stage);
      expect(p.done, stage).toBe(p.total);
    }
  });

  it("counts cross edges knocked out by one turn", () => {
    const c = newCube();
    c.move("F");
    // F moves the front cross edge out; the other three stay.
    expect(stageProgress(c, "cross").done).toBe(3);
  });

  it("counts F2L pairs a slot insertion disturbs", () => {
    const c = newCube();
    c.move("R D R'");
    expect(stageProgress(c, "f2l").done).toBeLessThan(4);
    expect(stageProgress(c, "cross").done).toBe(4);
  });

  it("treats a last layer that's only off by an AUF as fully in place", () => {
    const c = newCube();
    c.move("D");
    expect(stageProgress(c, "pll").done).toBe(8);
    expect(stageProgress(c, "oll").done).toBe(8);
  });

  it("sees a Sune's worth of misoriented pieces in OLL", () => {
    const c = newCube();
    // Sune in the engine frame (yellow on D): undoing it leaves three corners twisted.
    c.move("L' D' L D' L' D2 L");
    const p = stageProgress(c, "oll");
    expect(p.done).toBeLessThan(8);
    expect(stageProgress(c, "f2l").done).toBe(4);
  });
});

describe("recapLine", () => {
  it("praises matching the route and names the hint used", () => {
    expect(recapLine({ stage: "cross", yourTurns: 6, routeTurns: 6, ms: 5000, hint: 0 })).toBe(
      "Cross in 6 turns — as short as the Sat-Nav's route, no hints.",
    );
    expect(recapLine({ stage: "f2l", label: "Green-Red pair", yourTurns: 11, routeTurns: 8, ms: 5000, hint: 2 })).toBe(
      "Green-Red pair in 11 turns (3 more than the route's 8), with the full route.",
    );
  });
});
