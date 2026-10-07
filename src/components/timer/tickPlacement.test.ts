import { describe, expect, it } from "vitest";
import { tickEdge, tickPositionClass, faceOnScreen } from "./tickPlacement";

describe("tickEdge in the live (yellow-up, green-front) view", () => {
  it("puts the yellow face (D) on top and the white face (U) at the bottom", () => {
    expect(tickEdge("D")).toBe("top");
    expect(tickEdge("U")).toBe("bottom");
  });
  it("puts red (R) on the left, where it shows in this view, and orange (L) on the right", () => {
    expect(tickEdge("R")).toBe("left");
    expect(tickEdge("L")).toBe("right");
  });
  it("gives green (F) the front and blue (B) the back", () => {
    expect(tickEdge("F")).toBe("front");
    expect(tickEdge("B")).toBe("back");
  });
});

describe("tickEdge in a white-up view (the old assumption)", () => {
  const whiteUp = { rotateX: -24, rotateY: 32, rotateZ: 0 };
  it("is what a table written for white on top says", () => {
    expect(tickEdge("U", whiteUp)).toBe("top");
    expect(tickEdge("L", whiteUp)).toBe("left");
    expect(tickEdge("R", whiteUp)).toBe("right");
  });
});

describe("faceOnScreen", () => {
  it("sees the yellow, green and red faces and not the white, blue or orange ones", () => {
    const visible = (f: "U" | "D" | "L" | "R" | "F" | "B") => faceOnScreen(f).z > 0;
    expect((["D", "F", "R"] as const).every(visible)).toBe(true);
    expect((["U", "B", "L"] as const).some(visible)).toBe(false);
  });
});

describe("tickPositionClass", () => {
  it("is null for slices and rotations", () => {
    expect(tickPositionClass("M")).toBeNull();
    expect(tickPositionClass("x")).toBeNull();
  });
  it("gives each face its own place", () => {
    const all = ["U", "D", "L", "R", "F", "B"].map((f) => tickPositionClass(f));
    expect(new Set(all).size).toBe(6);
  });
});
