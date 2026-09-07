import { describe, expect, it } from "vitest";
import { scrambleToFacelets } from "./facelets";

describe("scrambleToFacelets", () => {
  it("returns the solved facelet string for an empty scramble", () => {
    expect(scrambleToFacelets("")).toBe(
      "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
    );
  });

  it("is always a 54-character string using only U/R/F/D/L/B", () => {
    const facelets = scrambleToFacelets("R U R' U' F2 D' L2 B");
    expect(facelets).toHaveLength(54);
    expect(facelets).toMatch(/^[URFDLB]{54}$/);
    // Exactly 9 of each face letter.
    for (const face of ["U", "R", "F", "D", "L", "B"]) {
      expect(facelets.split(face).length - 1).toBe(9);
    }
  });
});
