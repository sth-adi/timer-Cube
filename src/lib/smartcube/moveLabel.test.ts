import { describe, expect, it } from "vitest";
import { liveMoveLabel } from "./moveLabel";

describe("liveMoveLabel", () => {
  it("is the turn itself when there is nothing to pair with", () => {
    expect(liveMoveLabel(null, "R'", 100)).toBe("R'");
    expect(liveMoveLabel({ token: "U", atMs: 0 }, "R", 100)).toBe("R");
  });

  it("reads two opposite-face turns landing together as the slice they make", () => {
    expect(liveMoveLabel({ token: "R", atMs: 1000 }, "L'", 1120)).toBe("M");
    expect(liveMoveLabel({ token: "U", atMs: 1000 }, "D'", 1050)).toBe("E");
  });

  it("keeps separate turns separate once they are far enough apart", () => {
    expect(liveMoveLabel({ token: "R", atMs: 1000 }, "L'", 1600)).toBe("L'");
  });
});
