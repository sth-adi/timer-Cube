import { describe, expect, it, beforeEach } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import { buildMoments, getTimeMachineLog, recordTimeMachineMove, resetTimeMachine, sequenceTo, undoRoute } from "./timeMachine";

function record(tokens: string[], startMs: number, gap = 150) {
  tokens.forEach((t, i) => recordTimeMachineMove(t, startMs + i * gap));
}

describe("Cube Time Machine", () => {
  beforeEach(() => resetTimeMachine());

  it("splits the history into moments at pauses and flags solved states", () => {
    record(["R", "U", "R'", "U'"], 0); // a sexy move
    record(["U", "R", "U'", "R'"], 5000); // …and its inverse: back to solved
    record(["F2", "D"], 12000);
    const moments = buildMoments(getTimeMachineLog());
    expect(moments.map((m) => m.count)).toEqual([0, 4, 8, 10]);
    expect(moments.map((m) => m.solved)).toEqual([true, false, true, false]);
    expect(moments[1].burstTurns).toBe(4);
    expect(moments[1].burstMs).toBe(450);
  });

  it("undoes back to any moment exactly", () => {
    record(["R", "U2", "F'", "L", "D", "B2", "R'"], 0);
    const log = getTimeMachineLog();
    for (const count of [0, 2, 5, 7]) {
      const cube = newCube();
      cube.move(log.map((e) => e.token).join(" "));
      const route = undoRoute(log, count);
      if (route.length) cube.move(route.join(" "));
      const target = newCube();
      const seq = sequenceTo(log, count);
      if (seq) target.move(seq);
      expect(cube.asString()).toBe(target.asString());
    }
  });

  it("merges same-face turns in the way back", () => {
    record(["R", "R", "U", "U"], 0);
    expect(undoRoute(getTimeMachineLog(), 0)).toEqual(["U2", "R2"]);
  });
});
