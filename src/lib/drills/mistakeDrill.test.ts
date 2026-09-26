import { describe, expect, it } from "vitest";
import { newCube } from "@/lib/cube-engine/engine";
import type { Solve } from "@/types";
import type { Mistake } from "@/lib/analysis/mistakeRadar";
import { goalReached, gradeAttempt, repeatedMistake, type Drill } from "./mistakeDrill";

const mistake = (kind: Mistake["kind"], phase: Mistake["phase"]): Mistake => ({ kind, phase, atMs: 0, costMs: 1000, title: "", detail: "", moveIndex: 0 });

/** A drill whose start position is one D turn away from F2L done... with a solved pair to protect. */
const f2lDrill = (kind: Mistake["kind"]): Drill => ({
  id: "d",
  solveId: "s",
  date: 0,
  mistake: mistake(kind, "F2L"),
  setup: "R D R'", // breaks one pair; R D' R' puts it back
  frame: "U",
  goal: "F2L",
  original: { turns: 9, ms: 3000 },
});

describe("mistake drills", () => {
  it("knows each step's goal", () => {
    const c = newCube();
    expect(goalReached(c, "PLL")).toBe(true);
    c.move("D");
    expect(goalReached(c, "OLL")).toBe(true);
    expect(goalReached(c, "PLL")).toBe(false);
  });

  it("grades a clean retry against the original and the route", () => {
    const d = f2lDrill("pair-knocked");
    const g = gradeAttempt(d, { moves: ["R", "D'", "R'"], timesMs: [0, 300, 600] }, 3);
    expect(g.repeated).toBe(false);
    expect(g.vsOriginalTurns).toBe(-6);
    expect(g.vsOriginalMs).toBe(-2400);
    expect(g.verdict).toMatch(/^Clean/);
    expect(g.verdict).toMatch(/route was 3 turns; you took 3/);
  });

  it("spots the same knocked pair happening again", () => {
    const d = f2lDrill("pair-knocked");
    // Break a *different* solved pair (L D L') and wander before fixing things.
    const wander = ["L", "D", "L'", "U", "U'", "U", "U'", "U", "U'", "U"];
    expect(repeatedMistake(d, { moves: wander, timesMs: wander.map((_, i) => i * 100) })).toBe(true);
  });

  it("spots a second look as a pause", () => {
    const d: Drill = { ...f2lDrill("extra-oll-look"), mistake: mistake("extra-oll-look", "OLL"), goal: "OLL" };
    expect(repeatedMistake(d, { moves: ["R", "U", "R'"], timesMs: [0, 120, 900] })).toBe(true);
    expect(repeatedMistake(d, { moves: ["R", "U", "R'"], timesMs: [0, 120, 240] })).toBe(false);
  });

  it("builds drills from real solves", async () => {
    const fs = await import("node:fs");
    const path = "/tmp/claude-0/-home-user-timer-Cube/3daa8565-03f8-5123-9523-7e0c0b0250d1/scratchpad/seed.json";
    if (!fs.existsSync(path)) return;
    const { collectDrills } = await import("./mistakeDrill");
    const seed = JSON.parse(fs.readFileSync(path, "utf8")) as Omit<Solve, "id" | "sessionId" | "penalty">[];
    const drills = collectDrills(seed.map((s, i) => ({ ...s, id: `s${i}`, sessionId: "x", penalty: "none" as const })));
    for (const d of drills) {
      const c = newCube();
      c.move(d.setup);
      expect(goalReached(c, d.goal)).toBe(false);
      expect(d.original.turns).toBeGreaterThan(0);
    }
  });
});

describe("route to goal", () => {
  it("plans only as far as the drill's goal", async () => {
    const { routeToGoal } = await import("./mistakeDrill");
    const { planFromFacelets } = await import("@/lib/satnav/planner");
    const c = newCube();
    c.move("R D R'");
    const legs = await routeToGoal(c.asString(), "F2L", (f) => planFromFacelets(f));
    expect(legs).not.toBeNull();
    expect(legs!.reduce((a, l) => a + l.turns, 0)).toBeGreaterThan(0);
  });
});
