import { describe, expect, it } from "vitest";
import { applyTurn, parseTurn, turnToken } from "@/lib/cube-engine/stickerTurns";
import { FIRST_TURN_MS, MAX_TURN_MS, MIN_TURN_MS, RUSH_TURN_MS, stepTurns, turnDurationMs, type QueuedTurn, type TurnClock } from "./useTurnAnimation";

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
