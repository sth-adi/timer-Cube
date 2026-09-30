import { describe, expect, it } from "vitest";
import { parseScramble } from "./parseScramble";

describe("parseScramble", () => {
  it("accepts plain notation and normalises spacing", () => {
    expect(parseScramble("R U R' U'")).toBe("R U R' U'");
    expect(parseScramble("  R   U2\nF'  ")).toBe("R U2 F'");
  });
  it("handles curly primes and R2' / R'2 spellings", () => {
    expect(parseScramble("R’ U′ F2' D'2")).toBe("R' U' F2 D2");
  });
  it("strips numbering and a 'Scramble:' label", () => {
    expect(parseScramble("Scramble: R U F")).toBe("R U F");
    expect(parseScramble("1. R U F\n2. D L B")).toBe("R U F D L B");
  });
  it("rejects anything that isn't a 3x3 face turn, rather than guessing", () => {
    expect(parseScramble("Rw U")).toBeNull();
    expect(parseScramble("R U x")).toBeNull();
    expect(parseScramble("r u")).toBeNull();
    expect(parseScramble("M E S")).toBeNull();
    expect(parseScramble("hello world")).toBeNull();
    expect(parseScramble("R3")).toBeNull();
  });
  it("rejects empty and absurdly long input", () => {
    expect(parseScramble("")).toBeNull();
    expect(parseScramble("   ")).toBeNull();
    expect(parseScramble(Array(101).fill("R").join(" "))).toBeNull();
  });
});
