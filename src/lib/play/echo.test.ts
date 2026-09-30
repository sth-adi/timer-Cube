import { describe, expect, it } from "vitest";
import { IDLE, START_LENGTH, echoReduce, nextTurn, showTiming, step, type EchoState } from "./echo";

const start = (seed = 7) => echoReduce(IDLE, { type: "start", seed });
const play = (s: EchoState, grips: string[]) => grips.reduce((acc, grip) => echoReduce(acc, { type: "turn", grip }), s);
const ready = (seed = 7) => echoReduce(start(seed), { type: "shown" });

describe("generator", () => {
  it("is deterministic and stays in [0,1)", () => {
    expect(step(5)).toEqual(step(5));
    let seed = 1;
    for (let i = 0; i < 500; i++) {
      const [v, next] = step(seed);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      seed = next;
    }
  });
  it("never repeats a face back to back, over a long run", () => {
    let seed = 99;
    let prev: string | null = null;
    for (let i = 0; i < 2000; i++) {
      const [t, next]: [string, number] = nextTurn(prev, seed);
      if (prev) expect(t[0]).not.toBe(prev[0]);
      prev = t;
      seed = next;
    }
  });
  it("reaches every turn", () => {
    const seen = new Set<string>();
    let seed = 3;
    let prev: string | null = null;
    for (let i = 0; i < 400; i++) {
      const [t, next]: [string, number] = nextTurn(prev, seed);
      seen.add(t);
      prev = t;
      seed = next;
    }
    expect(seen.size).toBe(12);
  });
});

describe("a game", () => {
  it("starts by showing the opening run", () => {
    const s = start();
    expect(s.phase).toBe("show");
    expect(s.seq).toHaveLength(START_LENGTH);
    expect(s.round).toBe(0);
  });

  it("ignores turns while the run is being shown, and before starting", () => {
    expect(echoReduce(IDLE, { type: "turn", grip: "R" })).toBe(IDLE);
    const s = start();
    expect(echoReduce(s, { type: "turn", grip: s.seq[0] })).toBe(s);
  });

  it("takes correct turns, then grows the run by exactly one and shows it again", () => {
    const s = ready();
    const done = play(s, s.seq);
    expect(done.phase).toBe("show");
    expect(done.round).toBe(1);
    expect(done.input).toEqual([]);
    expect(done.seq).toHaveLength(s.seq.length + 1);
    expect(done.seq.slice(0, s.seq.length)).toEqual(s.seq); // the same run, one longer
  });

  it("keeps waiting mid-run", () => {
    const s = ready();
    const half = play(s, [s.seq[0]]);
    expect(half.phase).toBe("input");
    expect(half.input).toEqual([s.seq[0]]);
  });

  it("ends on the first wrong turn and says what was wanted", () => {
    const s = ready();
    const wrong = s.seq[0] === "R" ? "L" : "R";
    const over = play(s, [wrong]);
    expect(over.phase).toBe("over");
    expect(over.miss).toEqual({ expected: s.seq[0], got: wrong });
    // A turn the right way but the wrong direction is wrong too.
    const prime = s.seq[0].endsWith("'") ? s.seq[0][0] : `${s.seq[0]}'`;
    expect(play(s, [prime]).phase).toBe("over");
  });

  it("ignores everything once it's over", () => {
    const s = ready();
    const over = play(s, [s.seq[0] === "R" ? "L" : "R"]);
    expect(echoReduce(over, { type: "turn", grip: s.seq[0] })).toBe(over);
  });

  it("survives many rounds and counts them", () => {
    let s = ready(21);
    for (let r = 1; r <= 30; r++) {
      s = play(s, s.seq);
      expect(s.round).toBe(r);
      expect(s.seq).toHaveLength(START_LENGTH + r);
      s = echoReduce(s, { type: "shown" });
    }
  });

  it("restarts cleanly", () => {
    const s = play(ready(), ["R", "R"]);
    const again = echoReduce(s, { type: "start", seed: 7 });
    expect(again.round).toBe(0);
    expect(again.miss).toBeNull();
    expect(again.seq).toEqual(start(7).seq);
  });
});

describe("showTiming", () => {
  it("speeds up with length but never below the floor", () => {
    expect(showTiming(START_LENGTH).onMs).toBeGreaterThan(showTiming(START_LENGTH + 10).onMs);
    expect(showTiming(200).onMs).toBe(260);
  });
});
