import { describe, expect, it, beforeEach, vi } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import {
  MAX_ENTRIES,
  buildMoments,
  getTimeMachineLog,
  getTimeMachineVersion,
  recordTimeMachineMove,
  resetTimeMachine,
  sequenceTo,
  subscribeTimeMachine,
  undoRoute,
} from "./timeMachine";

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

  it("keeps entries in the order they were recorded", () => {
    record(["R", "U", "F"], 100, 10);
    expect(getTimeMachineLog().map((e) => [e.token, e.atMs])).toEqual([
      ["R", 100],
      ["U", 110],
      ["F", 120],
    ]);
  });

  it("keeps only the newest MAX_ENTRIES, still oldest first, across several batch trims", () => {
    const total = MAX_ENTRIES + 5_300;
    for (let i = 0; i < total; i++) recordTimeMachineMove(i % 2 ? "U" : "R", i);
    const log = getTimeMachineLog();
    expect(log).toHaveLength(MAX_ENTRIES);
    expect(log[0].atMs).toBe(total - MAX_ENTRIES);
    expect(log[log.length - 1].atMs).toBe(total - 1);
    for (let i = 1; i < log.length; i++) expect(log[i].atMs).toBe(log[i - 1].atMs + 1);
  });

  it("never shows more than the cap at any moment while filling past it", () => {
    for (let i = 0; i < MAX_ENTRIES + 2_500; i++) {
      recordTimeMachineMove("R", i);
      if (i % 997 === 0) expect(getTimeMachineLog().length).toBeLessThanOrEqual(MAX_ENTRIES);
    }
    expect(getTimeMachineLog()).toHaveLength(MAX_ENTRIES);
  });

  it("doesn't copy the log on every turn — only when it is read", () => {
    const before = getTimeMachineLog();
    expect(getTimeMachineLog()).toBe(before); // unchanged log, same snapshot
    const slice = vi.spyOn(Array.prototype, "slice");
    for (let i = 0; i < 50; i++) recordTimeMachineMove("R", i);
    expect(slice).not.toHaveBeenCalled();
    slice.mockRestore();
    expect(getTimeMachineLog()).not.toBe(before);
    expect(getTimeMachineLog()).toHaveLength(50);
  });

  it("bumps the version and notifies subscribers on every record and reset", () => {
    const heard = vi.fn();
    const off = subscribeTimeMachine(heard);
    const v0 = getTimeMachineVersion();
    recordTimeMachineMove("R", 1);
    recordTimeMachineMove("U", 2);
    expect(getTimeMachineVersion()).toBe(v0 + 2);
    resetTimeMachine();
    expect(getTimeMachineVersion()).toBe(v0 + 3);
    expect(heard).toHaveBeenCalledTimes(3);
    expect(getTimeMachineLog()).toEqual([]);
    off();
    recordTimeMachineMove("F", 3);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it("hands back a fresh array after each change, so an old snapshot is never mutated", () => {
    record(["R", "U"], 0);
    const first = getTimeMachineLog();
    recordTimeMachineMove("F", 999);
    expect(first).toHaveLength(2);
    expect(getTimeMachineLog()).toHaveLength(3);
  });

  it("a throwing subscriber doesn't stop the turn being recorded or other subscribers", () => {
    const heard = vi.fn();
    const offBad = subscribeTimeMachine(() => {
      throw new Error("render bug");
    });
    const offGood = subscribeTimeMachine(heard);
    expect(() => recordTimeMachineMove("R", 1)).not.toThrow();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(getTimeMachineLog()).toHaveLength(1);
    offBad();
    offGood();
  });
});
