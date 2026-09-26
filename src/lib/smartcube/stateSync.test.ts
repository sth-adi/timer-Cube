import { describe, expect, it } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import { distrust, newStateSync, onReport, onTurn, settle, validFacelets } from "./stateSync";

const SOLVED = newCube().asString();
const after = (seq: string) => {
  const c = newCube();
  c.move(seq);
  return c.asString();
};

describe("keeping the app's cube in step with the real one", () => {
  it("only accepts a real, complete state", () => {
    expect(validFacelets(SOLVED)).toBe(true);
    expect(validFacelets(after("R U F'"))).toBe(true);
    expect(validFacelets(SOLVED.slice(1))).toBe(false);
    expect(validFacelets("X" + SOLVED.slice(1))).toBe(false);
    expect(validFacelets(SOLVED.replace("R", "U"))).toBe(false);
  });

  it("starts from the cube's own report when connecting", () => {
    const s = newStateSync();
    expect(onReport(s, after("R U"))).toBe("adopt");
    expect(onReport(s, after("R U"))).toBe("wait");
  });

  it("corrects a lost turn once the cube is still, but never from a report a turn has overtaken", () => {
    const s = newStateSync();
    onReport(s, SOLVED);
    // Real cube: R then U. The app only heard R.
    onReport(s, after("R U"));
    expect(settle(s, after("R"))).toBe(after("R U"));
    // A report arrives, then a turn: the report is stale.
    onReport(s, after("R U"));
    onTurn(s);
    expect(settle(s, after("R U F"))).toBeNull();
    // A report that agrees changes nothing.
    onReport(s, after("R"));
    expect(settle(s, after("R"))).toBeNull();
  });

  it("after you say it's solved on a cube that can't be reset, ignores its old count until it agrees", () => {
    const s = newStateSync();
    onReport(s, SOLVED);
    distrust(s);
    onReport(s, after("R U"));
    expect(settle(s, SOLVED)).toBeNull();
    // Agreement restores trust.
    onReport(s, after("F"));
    expect(settle(s, after("F"))).toBeNull();
    onReport(s, after("F D"));
    expect(settle(s, after("F"))).toBe(after("F D"));
  });
});
