import { describe, expect, it } from "vitest";
import { Cube } from "@/lib/cube-engine/engine";
import { ScrambleGuide, mergeTurn } from "./scrambleGuide";

const steps = (s: string) => s.split(" ");
function run(guide: ScrambleGuide, turns: string) {
  let view = guide.view();
  for (const t of turns.split(" ").filter(Boolean)) view = guide.push(t);
  return view;
}

describe("mergeTurn", () => {
  it("combines same-face turns and cancels them out", () => {
    expect(mergeTurn(["R"], "R")).toEqual(["R2"]);
    expect(mergeTurn(["R"], "R'")).toEqual([]);
    expect(mergeTurn(["R2"], "R")).toEqual(["R'"]);
  });
  it("merges past an opposite face (they commute) but not past another axis", () => {
    expect(mergeTurn(["R", "L"], "R'")).toEqual(["L"]);
    expect(mergeTurn(["R", "U"], "R'")).toEqual(["R", "U", "R'"]);
  });
});

describe("ScrambleGuide", () => {
  it("highlights each step in turn and finishes", () => {
    const g = new ScrambleGuide(steps("R U' F2"));
    expect(g.view()).toMatchObject({ index: 0, undo: [], done: false });
    expect(run(g, "R")).toMatchObject({ index: 1 });
    expect(run(g, "U'")).toMatchObject({ index: 2 });
    expect(run(g, "F F")).toMatchObject({ index: 3, done: true });
  });

  it("a half turn done as two quarters is half-done after the first, either direction", () => {
    for (const q of ["F", "F'"]) {
      const g = new ScrambleGuide(steps("F2 R"));
      expect(run(g, q)).toMatchObject({ index: 0, partial: true, undo: [], fix: null });
      expect(run(g, q)).toMatchObject({ index: 1, partial: false });
    }
  });

  it("a half turn reported as one R2 works too", () => {
    expect(run(new ScrambleGuide(steps("R2 U")), "R2")).toMatchObject({ index: 1 });
  });

  it("a wrong move tells you to undo it, then the scramble carries on from the same step", () => {
    const g = new ScrambleGuide(steps("R U F"));
    run(g, "R");
    expect(run(g, "D")).toMatchObject({ index: 1, undo: ["D'"] });
    expect(run(g, "D'")).toMatchObject({ index: 1, undo: [] });
    expect(run(g, "U F")).toMatchObject({ index: 3, done: true });
  });

  it("several wrong moves: undo newest first, shrinking live as you go", () => {
    const g = new ScrambleGuide(steps("R U F"));
    run(g, "R");
    expect(run(g, "F L2 B'")).toMatchObject({ index: 1, undo: ["B", "L2", "F'"] });
    expect(run(g, "B")).toMatchObject({ undo: ["L2", "F'"] });
    expect(run(g, "L'")).toMatchObject({ undo: ["L'", "F'"] }); // half of the L2 undone
    expect(run(g, "L'")).toMatchObject({ undo: ["F'"] });
    expect(run(g, "F'")).toMatchObject({ index: 1, undo: [] });
  });

  it("the wrong way round on the right face offers the one turn that fixes it", () => {
    const g = new ScrambleGuide(steps("R U"));
    expect(run(g, "R'")).toMatchObject({ index: 0, fix: "R2", undo: [] });
    expect(run(g, "R2")).toMatchObject({ index: 1, fix: null });
    // …and undoing it the long way works too.
    const h = new ScrambleGuide(steps("R U"));
    run(h, "R'");
    expect(run(h, "R R")).toMatchObject({ index: 1 });
  });

  it("half of a half turn, then a wrong face: undo only the mistake, the half turn stays half done", () => {
    const g = new ScrambleGuide(steps("F2 R"));
    expect(run(g, "F U")).toMatchObject({ index: 0, undo: ["U'"], partial: true });
    expect(run(g, "U'")).toMatchObject({ index: 0, undo: [], partial: true });
    expect(run(g, "F")).toMatchObject({ index: 1 });
  });

  it("an opposite-face mistake before the right move still counts the right move", () => {
    // Turning L then R when the step is R: L and R commute, so R is done
    // and L is the one mistake to undo.
    const g = new ScrambleGuide(steps("R U"));
    expect(run(g, "L R")).toMatchObject({ index: 1, undo: ["L'"] });
    expect(run(g, "L'")).toMatchObject({ index: 1, undo: [] });
    // And two opposite-face steps done in the other order both count.
    expect(run(new ScrambleGuide(steps("R L U")), "L R")).toMatchObject({ index: 2, undo: [] });
  });

  it("what the guide thinks was applied is exactly the cube's state", () => {
    const g = new ScrambleGuide(steps("R U' F2 D L'"));
    const cube = new Cube();
    for (const t of "R U' F D2 B F L".split(" ")) {
      cube.move(t);
      g.push(t);
      const expected = new Cube();
      if (g.applied.length) expected.move(g.applied.join(" "));
      expect(expected.asString()).toBe(cube.asString());
    }
  });

  it("resync: turns measured to get back on track become the undo list, and the step is kept", () => {
    const g = new ScrambleGuide(steps("R U F"));
    run(g, "R");
    expect(g.resync(["D'", "B"])).toMatchObject({ index: 1, undo: ["D'", "B"] });
    expect(run(g, "D' B")).toMatchObject({ index: 1, undo: [] });
    expect(run(g, "U F")).toMatchObject({ done: true });
  });
});
