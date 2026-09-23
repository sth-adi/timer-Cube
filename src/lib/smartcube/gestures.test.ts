import { describe, expect, it } from "vitest";
import { GestureDetector, GESTURE_BINDINGS, bindingFor, type GestureId } from "./gestures";

function feed(tokens: string[], gapMs = 150, startMs = 0): (GestureId | null)[] {
  const d = new GestureDetector();
  return tokens.map((token, i) => d.push({ token, timeStampMs: startMs + i * gapMs }));
}

describe("GestureDetector", () => {
  it("fires on four quick same-direction quarter turns", () => {
    expect(feed(["U", "U", "U", "U"])).toEqual([null, null, null, "U"]);
    expect(feed(["R'", "R'", "R'", "R'"]).at(-1)).toBe("R'");
  });

  it("accepts double turns as two quarters in the running direction", () => {
    expect(feed(["L'", "L2", "L'"]).at(-1)).toBe("L'");
    expect(feed(["F2", "F2"]).at(-1)).toBe("F");
  });

  it("never fires on direction changes or other faces in between", () => {
    expect(feed(["U", "U", "U'", "U"])).toEqual([null, null, null, null]);
    expect(feed(["U", "U", "R", "U", "U"]).every((g) => g === null)).toBe(true);
  });

  it("ignores slow turns — four separate U moves aren't a gesture", () => {
    expect(feed(["U", "U", "U", "U"], 700).every((g) => g === null)).toBe(true);
  });

  it("fires twice for eight turns, not once", () => {
    const out = feed(Array(8).fill("D"));
    expect(out.filter(Boolean)).toEqual(["D", "D"]);
  });

  it("does not fire mid-solve-like sequences", () => {
    const solveLike = "R U R' U' R U2 R' F R U R' U' F' U U R".split(" ");
    expect(feed(solveLike).every((g) => g === null)).toBe(true);
  });

  it("every binding is a distinct gesture", () => {
    const ids = GESTURE_BINDINGS.map((b) => b.gesture);
    expect(new Set(ids).size).toBe(ids.length);
    expect(bindingFor("U")?.action).toBe("nextScramble");
  });
});
