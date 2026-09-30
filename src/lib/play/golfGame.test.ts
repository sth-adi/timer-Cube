import { describe, expect, it } from "vitest";
import { cubeFromAlg } from "../cube-engine/engine";
import { SOLVED_FACELETS } from "../store/smartCubeStore";
import { generateHole } from "./golf";
import { MENU, ROUND_PARS, SKIP_PENALTY, golfReduce, totalOverPar, type GolfAction, type GolfState } from "./golfGame";

const quarters = (alg: readonly string[]) => alg.flatMap((t) => (t.endsWith("2") ? [t[0], t[0]] : [t]));
const faceletsAfter = (moves: readonly string[]) => cubeFromAlg(moves.join(" ")).asString();

/** Feeds turns through the machine the way the page does: each with the cube's state after it. */
function feed(state: GolfState, turns: readonly string[], from: readonly string[] = []): GolfState {
  const done: string[] = [...from];
  let s = state;
  for (const token of turns) {
    done.push(token);
    s = golfReduce(s, { type: "turn", token, facelets: faceletsAfter(done) });
  }
  return s;
}

const begun = (par = 4, seed = 11) => {
  const hole = generateHole(par, seed);
  const s = golfReduce(golfReduce(MENU, { type: "start", seed: 1 }), { type: "hole", hole, facelets: SOLVED_FACELETS });
  return { hole, s };
};

describe("a hole", () => {
  it("starts loading, then waits for a solved cube before the scramble", () => {
    const loading = golfReduce(MENU, { type: "start", seed: 1 });
    expect(loading.phase).toBe("loading");
    const hole = generateHole(3, 5);
    expect(golfReduce(loading, { type: "hole", hole, facelets: SOLVED_FACELETS }).phase).toBe("setup");
    const unsolved = faceletsAfter(["R", "U"]);
    const waiting = golfReduce(loading, { type: "hole", hole, facelets: unsolved });
    expect(waiting.phase).toBe("reset");
    // Solving it (by any route) moves on.
    expect(golfReduce(waiting, { type: "turn", token: "U'", facelets: faceletsAfter(["R"]) }).phase).toBe("reset");
    expect(golfReduce(waiting, { type: "turn", token: "R'", facelets: SOLVED_FACELETS }).phase).toBe("setup");
  });

  it("lets you say the cube is solved when the app's picture of it drifted", () => {
    const hole = generateHole(3, 5);
    const waiting = golfReduce(golfReduce(MENU, { type: "start", seed: 1 }), { type: "hole", hole, facelets: faceletsAfter(["R"]) });
    expect(waiting.phase).toBe("reset");
    expect(golfReduce(waiting, { type: "confirmSolved" }).phase).toBe("setup");
    const { s } = begun();
    expect(golfReduce(s, { type: "confirmSolved" })).toBe(s);
  });

  it("switches to play the instant the cube reads as the scramble", () => {
    const { hole, s } = begun(4);
    const inSetup = feed(s, quarters(hole.scramble).slice(0, -1));
    expect(inSetup.phase).toBe("setup");
    const playing = feed(s, quarters(hole.scramble));
    expect(playing.phase).toBe("play");
    expect(playing.playTurns).toEqual([]);
  });

  it("accepts a different route to the same scramble state", () => {
    const { hole, s } = begun(4);
    // Reach the scramble by detouring: a wasted pair first, then the scramble.
    const turns = ["F", "F'", ...quarters(hole.scramble)];
    expect(feed(s, turns).phase).toBe("play");
  });

  it("holes out the instant the cube reads solved, scoring the simplified turns", () => {
    const { hole, s } = begun(5);
    const inPlay = feed(s, quarters(hole.scramble));
    const solving = quarters(hole.solution);
    const done = feed(inPlay, solving, quarters(hole.scramble));
    expect(done.phase).toBe("holed");
    expect(done.results).toEqual([{ par: 5, strokes: 5, skipped: false }]);
  });

  it("charges for detours but never for turns that cancel", () => {
    const { hole, s } = begun(3, 4);
    const inPlay = feed(s, quarters(hole.scramble));
    const solving = quarters(hole.solution);
    // A wasted pair that cancels costs nothing; an honest detour (turn + its inverse separated) costs.
    const done = feed(inPlay, ["U", "U'", ...solving], quarters(hole.scramble));
    expect(done.results[0].strokes).toBe(3);
  });

  it("can't be holed below par", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { hole, s } = begun(4, seed);
      const inPlay = feed(s, quarters(hole.scramble));
      const done = feed(inPlay, quarters(hole.solution), quarters(hole.scramble));
      expect(done.results[0].strokes).toBeGreaterThanOrEqual(4);
    }
  });

  it("skipping costs par plus the penalty", () => {
    const { s } = begun(4);
    const skipped = golfReduce(s, { type: "skip" });
    expect(skipped.phase).toBe("holed");
    expect(skipped.results[0]).toEqual({ par: 4, strokes: 4 + SKIP_PENALTY, skipped: true });
    // Can't skip twice.
    expect(golfReduce(skipped, { type: "skip" })).toBe(skipped);
  });

  it("ignores turns when nothing is in play", () => {
    const a: GolfAction = { type: "turn", token: "R", facelets: SOLVED_FACELETS };
    expect(golfReduce(MENU, a)).toBe(MENU);
    const { s } = begun();
    const holed = golfReduce(s, { type: "skip" });
    expect(golfReduce(holed, a)).toBe(holed);
  });
});

describe("a round", () => {
  it("runs every hole then shows the card", () => {
    let s = golfReduce(MENU, { type: "start", seed: 1 });
    for (let i = 0; i < ROUND_PARS.length; i++) {
      expect(s.phase).toBe("loading");
      expect(s.index).toBe(i);
      s = golfReduce(s, { type: "hole", hole: generateHole(ROUND_PARS[i], 100 + i), facelets: SOLVED_FACELETS });
      s = golfReduce(s, { type: "skip" });
      s = golfReduce(s, { type: "next" });
    }
    expect(s.phase).toBe("card");
    expect(s.results).toHaveLength(ROUND_PARS.length);
    expect(totalOverPar(s.results)).toBe(ROUND_PARS.length * SKIP_PENALTY);
  });

  it("only moves on from a finished hole", () => {
    const { s } = begun();
    expect(golfReduce(s, { type: "next" })).toBe(s);
  });

  it("goes back to the menu cleanly", () => {
    const { s } = begun();
    expect(golfReduce(s, { type: "menu" })).toEqual(MENU);
  });
});

describe("totalOverPar", () => {
  it("sums the gaps", () => {
    expect(totalOverPar([])).toBe(0);
    expect(totalOverPar([{ par: 4, strokes: 4, skipped: false }, { par: 5, strokes: 7, skipped: false }])).toBe(2);
  });
});
