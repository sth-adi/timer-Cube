import { describe, expect, it } from "vitest";
import { ScrambleGuide } from "./scrambleGuide";
import { scrambleCallout, spokenTurn } from "./spokenScramble";

describe("spokenTurn", () => {
  it("spells out primes and halves", () => {
    expect(spokenTurn("R")).toBe("R");
    expect(spokenTurn("R'")).toBe("R prime");
    expect(spokenTurn("U2")).toBe("U 2");
  });
});

/** Runs the guide through `turns`, collecting what would be spoken. */
function transcript(steps: string[], turns: string[]): string[] {
  const guide = new ScrambleGuide(steps);
  let prev = null as ReturnType<ScrambleGuide["view"]> | null;
  const said: string[] = [];
  const first = scrambleCallout(prev, guide.view());
  if (first) said.push(first);
  prev = guide.view();
  for (const t of turns) {
    const next = guide.push(t);
    const line = scrambleCallout(prev, next);
    if (line) said.push(line);
    prev = next;
  }
  return said;
}

describe("scrambleCallout", () => {
  it("names the first step, then each next one as the last is made, then 'Scrambled'", () => {
    expect(transcript(["R", "U'", "F2"], ["R", "U'", "F", "F"])).toEqual(["R", "U prime", "F 2", "Again", "Scrambled"]);
  });

  it("says 'again' after the first quarter of a half turn, and doesn't repeat itself", () => {
    const said = transcript(["F2", "R"], ["F", "F", "R"]);
    expect(said).toEqual(["F 2", "Again", "R", "Scrambled"]);
  });

  it("reads out the way back after a wrong turn, then unwinds it one at a time", () => {
    const said = transcript(["R", "U", "F"], ["R", "D", "B"]);
    // Wrong D, then a second wrong turn B: undo B' then D'.
    expect(said[0]).toBe("R");
    expect(said[1]).toBe("U");
    expect(said[2]).toBe("Undo D prime");
    expect(said[3]).toBe("Undo B prime, D prime");
  });

  it("goes back to naming the step once the mistake is undone", () => {
    const said = transcript(["R", "U", "F"], ["R", "D", "D'"]);
    expect(said.slice(-1)[0]).toBe("U");
  });

  it("tells you the single turn that fixes a right-face wrong-amount", () => {
    const said = transcript(["R", "U"], ["R'"]);
    expect(said.some((l) => l.startsWith("Turn "))).toBe(true);
  });

  it("stays quiet when nothing changed", () => {
    const guide = new ScrambleGuide(["R", "U"]);
    const v = guide.view();
    expect(scrambleCallout(v, v)).toBeNull();
  });
});
