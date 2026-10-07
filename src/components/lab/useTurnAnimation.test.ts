import { describe, expect, it } from "vitest";
import { cubeFromAlg } from "@/lib/cube-engine/engine";
import { applyMove, applyTurn, isPairMove, moveToken, parseMove, parseTurn, turnToken } from "@/lib/cube-engine/stickerTurns";
import {
  FIRST_TURN_MS,
  MAX_TURN_MS,
  MIN_TURN_MS,
  RUSH_TURN_MS,
  SLICE_HOLD_MS,
  enqueueTurn,
  stepTurns,
  turnDurationMs,
  type QueuedTurn,
  type TurnClock,
} from "./useTurnAnimation";

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
const q = (tokens: string[], gapMs: number | null): QueuedTurn[] => tokens.map((t) => ({ turn: parseTurn(t)!, gapMs }));
const after = (tokens: string[]) => tokens.reduce(applyTurn, SOLVED);

describe("turnDurationMs", () => {
  it("follows the real gap since the previous move, clamped", () => {
    expect(turnDurationMs(150, 0)).toBe(150);
    expect(turnDurationMs(95, 0)).toBe(95);
    expect(turnDurationMs(20, 0)).toBe(MIN_TURN_MS);
    expect(turnDurationMs(0, 0)).toBe(MIN_TURN_MS);
    expect(turnDurationMs(5000, 0)).toBe(MAX_TURN_MS);
  });

  it("a fast alg turns faster than a slow one", () => {
    expect(turnDurationMs(80, 0)).toBeLessThan(turnDurationMs(180, 0));
  });

  it("uses a calm default with no earlier move to measure against", () => {
    expect(turnDurationMs(null, 0)).toBe(FIRST_TURN_MS);
    expect(turnDurationMs(Number.NaN, 0)).toBe(FIRST_TURN_MS);
  });

  it("shortens as turns pile up, down to a floor", () => {
    const d = [0, 1, 2, 3, 8].map((w) => turnDurationMs(150, w));
    expect(d).toEqual([150, 113, 75, RUSH_TURN_MS, RUSH_TURN_MS]);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1]);
  });

  it("never goes under the floor, nor over the ceiling, whatever the input", () => {
    for (const gap of [null, -10, 0, 40, 100, 220, 1e6]) {
      for (const waiting of [0, 1, 2, 5, 50]) {
        const ms = turnDurationMs(gap, waiting);
        expect(ms).toBeGreaterThanOrEqual(RUSH_TURN_MS);
        expect(ms).toBeLessThanOrEqual(MAX_TURN_MS);
      }
    }
  });
});

describe("stepTurns", () => {
  const ALG = ["R", "U", "R'", "U'", "F2", "D"];

  it("plays the turns in queue order and lands on exactly the cube the turns add up to", () => {
    let clock: TurnClock = { shown: SOLVED, active: null, queue: q(ALG, 90) };
    const seen: string[] = [];
    for (let now = 1000; now < 3000 && (clock.active || clock.queue.length || seen.length === 0); now += 16) {
      clock = stepTurns(clock, now);
      if (clock.active) {
        const t = turnToken(clock.active.turn);
        if (seen[seen.length - 1] !== t || seen.length === 0) seen.push(t);
      }
    }
    expect(seen).toEqual(ALG);
    expect(clock.active).toBeNull();
    expect(clock.shown).toBe(after(ALG));
  });

  it("finishes a whole backlog in one step after a long stall, in order", () => {
    const start = stepTurns({ shown: SOLVED, active: null, queue: q(ALG, 150) }, 100);
    expect(start.active && turnToken(start.active.turn)).toBe("R");
    const done = stepTurns(start, 100 + 60_000);
    expect(done.active).toBeNull();
    expect(done.queue).toEqual([]);
    expect(done.shown).toBe(after(ALG));
  });

  it("starts the next turn where the last one ended, so a steady stream does not drift", () => {
    const first = stepTurns({ shown: SOLVED, active: null, queue: q(["R", "U"], 100) }, 0);
    expect(first.active?.dur).toBe(turnDurationMs(100, 1));
    const second = stepTurns(first, first.active!.dur + 7);
    expect(turnToken(second.active!.turn)).toBe("U");
    expect(second.active!.start).toBe(first.active!.dur);
    expect(second.shown).toBe(after(["R"]));
  });

  it("does not touch the queue it was given", () => {
    const queue = q(["R", "U"], 100);
    stepTurns({ shown: SOLVED, active: null, queue }, 0);
    expect(queue).toHaveLength(2);
  });
});

describe("slice and rotation moves in the queue", () => {
  it("plays an M and an x as one move each and lands exactly on the engine's state", () => {
    const queue: QueuedTurn[] = [
      { turn: parseMove("M")!, gapMs: 100 },
      { turn: parseMove("U")!, gapMs: 100 },
      { turn: parseMove("x'")!, gapMs: 100 },
    ];
    const seen: string[] = [];
    let clock: TurnClock = { shown: SOLVED, active: null, queue };
    for (let now = 0; now < 2000 && (clock.active || clock.queue.length || !seen.length); now += 8) {
      clock = stepTurns(clock, now);
      if (clock.active) {
        const t = moveToken(clock.active.turn);
        if (seen[seen.length - 1] !== t) seen.push(t);
      }
    }
    expect(seen).toEqual(["M", "U", "x'"]);
    expect(clock.shown).toBe(cubeFromAlg("M U x'").asString());
  });
});

describe("a slice-shaped opposite-face pair plays as one turn", () => {
  /** Runs every turn that is waiting to its end. */
  const settle = (c: TurnClock) => stepTurns(stepTurns(c, 60_000), 120_000);
  const face = (t: string, gapMs: number | null): QueuedTurn => ({ turn: parseTurn(t)!, gapMs });
  const idle: TurnClock = { shown: SOLVED, active: null, queue: [] };

  it("holds a lone first turn a moment, and not a turn behind another", () => {
    const one = enqueueTurn(idle, face("R'", null), 1000);
    expect(one.queue[0].holdUntil).toBe(1000 + SLICE_HOLD_MS);
    expect(stepTurns(one, 1000 + SLICE_HOLD_MS - 1).active).toBeNull();
    expect(stepTurns(one, 1000 + SLICE_HOLD_MS - 1).queue).toHaveLength(1);
    expect(stepTurns(one, 1000 + SLICE_HOLD_MS).active).not.toBeNull();
    // Behind a queued turn there is no waiting.
    const two = enqueueTurn(one, face("U", 300), 1300);
    expect(two.queue[1].holdUntil).toBeUndefined();
    expect(stepTurns(two, 1300).active).not.toBeNull();
  });

  it("merges a partner that arrives while the first is still waiting", () => {
    const first = enqueueTurn(idle, face("R'", 400), 1000);
    const both = enqueueTurn(first, face("L", 60), 1060);
    expect(both.queue).toHaveLength(1);
    const move = both.queue[0].turn;
    expect(isPairMove(move) && moveToken(move)).toBe("R' L");
    expect(both.queue[0].gapMs).toBe(400);
    expect(both.queue[0].holdUntil).toBeUndefined();
    const played = stepTurns(both, 1060);
    expect(played.active && isPairMove(played.active.turn)).toBe(true);
    expect(settle(both).shown).toBe(cubeFromAlg("R' L").asString());
  });

  it("merges a partner that arrives while the first is under way, the late layer setting off from rest", () => {
    const started = stepTurns(enqueueTurn(idle, face("R'", 400), 1000), 1000 + SLICE_HOLD_MS);
    const start = started.active!.start;
    const dur = started.active!.dur;
    const arrive = start + dur * 0.4;
    const joined = enqueueTurn(started, face("L", 150), arrive);
    expect(joined.queue).toHaveLength(0);
    const a = joined.active!;
    expect(isPairMove(a.turn) && a.turn.lag).toBeCloseTo(0.4, 5);
    // The first layer is exactly where it was, and it still has time to run.
    expect((arrive - a.start) / a.dur).toBeCloseTo(0.4, 5);
    expect(a.start + a.dur).toBeGreaterThan(arrive + dur * 0.5);
    expect(stepTurns(joined, a.start + a.dur + 1).shown).toBe(cubeFromAlg("R' L").asString());
  });

  it("does not merge a pair that arrives too late, on the same face, or turning against each other", () => {
    const first = enqueueTurn(idle, face("R'", 400), 1000);
    expect(enqueueTurn(first, face("L", 300), 1300).queue).toHaveLength(2); // beyond the pair window
    expect(enqueueTurn(first, face("R", 50), 1050).queue).toHaveLength(2); // same face
    expect(enqueueTurn(first, face("L'", 50), 1050).queue).toHaveLength(2); // R' L' is not a slice shape
    expect(enqueueTurn(first, face("U", 50), 1050).queue).toHaveLength(2);
  });

  it("does not merge into a turn that is nearly done, nor into a pair that already merged", () => {
    const started = stepTurns(enqueueTurn(idle, face("R'", 400), 1000), 1000 + SLICE_HOLD_MS);
    const late = started.active!.start + started.active!.dur * 0.95;
    expect(enqueueTurn(started, face("L", 150), late).queue).toHaveLength(1);
    const pair = enqueueTurn(enqueueTurn(idle, face("R'", 400), 1000), face("L", 50), 1050);
    expect(enqueueTurn(pair, face("R'", 50), 1100).queue).toHaveLength(2);
  });

  it("every merge keeps the cube on exactly the state the plain face turns add up to", () => {
    for (const alg of [["R'", "L"], ["U", "D'"], ["F2", "B2"], ["B", "F'"]]) {
      let clock = enqueueTurn(idle, face(alg[0], 500), 1000);
      clock = enqueueTurn(clock, face(alg[1], 80), 1080);
      expect(settle(clock).shown).toBe(alg.reduce(applyMove, SOLVED));
    }
  });
});
