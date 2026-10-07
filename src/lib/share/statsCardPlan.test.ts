import { describe, expect, it } from "vitest";
import { CARD_FORMATS, safeBox, type Box } from "./cardLayout";
import { planStatsCard } from "./statsCardPlan";

const overlap = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

describe("stats card plan", () => {
  for (const format of ["portrait", "link"] as const) {
    for (const cells of [1, 3, 4]) {
      for (const hasTrend of [false, true]) {
        for (const hasPhases of [false, true]) {
          it(`${format}, ${cells} cells, trend ${hasTrend}, phases ${hasPhases}: inside the safe margins, nothing overlapping`, () => {
            const plan = planStatsCard({ format, cells, hasTrend, hasPhases });
            const safe = safeBox(CARD_FORMATS[format]);
            const boxes: Box[] = [plan.header, plan.title, plan.hero, plan.grid, ...[plan.trend, plan.phases, plan.emblem].filter((b): b is Box => !!b)];
            for (const b of boxes) {
              expect(b.w).toBeGreaterThan(0);
              expect(b.h).toBeGreaterThan(0);
              expect(b.x).toBeGreaterThanOrEqual(safe.x - 0.5);
              expect(b.x + b.w).toBeLessThanOrEqual(safe.x + safe.w + 0.5);
              expect(b.y).toBeGreaterThanOrEqual(safe.y - 0.5);
              expect(b.y + b.h).toBeLessThanOrEqual(safe.y + safe.h + 0.5);
            }
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `${i} vs ${j}`).toBe(false);
            expect(plan.cellBoxes).toHaveLength(cells);
            for (const c of plan.cellBoxes) expect(overlap(c, plan.grid) && c.w > 0 && c.h > 0).toBe(true);
            expect(plan.footerY).toBe(safe.y + safe.h);
            // The optional pieces appear only when asked for; the cube emblem fills the gap when neither is.
            expect(!!plan.trend).toBe(hasTrend);
            expect(!!plan.phases).toBe(hasPhases);
          });
        }
      }
    }
  }

  it("gives the trend the space the phase bar does not use", () => {
    const withPhases = planStatsCard({ format: "portrait", cells: 4, hasTrend: true, hasPhases: true });
    const without = planStatsCard({ format: "portrait", cells: 4, hasTrend: true, hasPhases: false });
    expect(without.trend!.h).toBeGreaterThan(withPhases.trend!.h);
  });
});
