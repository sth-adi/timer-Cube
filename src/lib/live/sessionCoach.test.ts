import { describe, expect, it } from "vitest";
import type { Solve } from "@/types";
import { buildProfile, currentSitting, liveCoach } from "./sessionCoach";

const HOUR = 3_600_000;
let n = 0;
const at = (date: number, timeMs: number, penalty: Solve["penalty"] = "none"): Solve => ({ id: `s${n++}`, sessionId: "x", timeMs, penalty, scramble: "", date });

/** Sittings with a two-solve warm-up, a bad solve every 7th that drags the next one, and a fade after solve 25. */
function history(sittings = 8, len = 34): Solve[] {
  const out: Solve[] = [];
  for (let s = 0; s < sittings; s++) {
    let t = s * 24 * HOUR;
    let prevBad = false;
    for (let i = 0; i < len; i++) {
      let ms = 10000 + ((i * 7919) % 5) * 100 - 200;
      if (i < 2) ms *= 1.2;
      if (i >= 25) ms *= 1.08;
      if (prevBad) ms *= 1.12;
      prevBad = i % 7 === 6;
      if (prevBad) ms *= 1.3;
      t += ms + 20_000;
      out.push(at(t, Math.round(ms)));
    }
  }
  return out;
}

describe("Live Session Coach", () => {
  const h = history();

  it("learns your warm-up, tilt, and fade from past sittings", () => {
    const p = buildProfile(h)!;
    expect(p.warmupSolves).toBe(3);
    expect(p.coldPenalty).toBeGreaterThan(0.1);
    expect(p.tilter).toBe(true);
    expect(p.fadeFrom).toBe(20);
    expect(buildProfile(h.slice(0, 20))).toBeNull();
  });

  it("finds the sitting you're in", () => {
    const now = h[h.length - 1].date + 60_000;
    expect(currentSitting(h, now)).toHaveLength(34);
    expect(currentSitting(h, now + HOUR)).toHaveLength(0);
  });

  it("calls warm-up solves warm-up, and a new sitting a new sitting", () => {
    const opts = { typicalMs: 10000, bestAo5Ms: null };
    expect(liveCoach(h, [], opts).cards[0].title).toBe("New sitting");
    const first = liveCoach(h, [at(1e12, 12300)], opts);
    expect(first.cards[0].kind).toBe("warmup");
    expect(first.cards[0].title).toBe("Warm-up 1 of 2");
  });

  it("warns a tilter after a bad solve, and cheers a run", () => {
    const opts = { typicalMs: 10000, bestAo5Ms: null };
    const base = [12000, 11500, 10000, 10100, 9900].map((ms, i) => at(1e12 + i * 30_000, ms));
    const bad = liveCoach(h, [...base, at(1e12 + 200_000, 13500)], opts);
    expect(bad.cards[0].kind).toBe("tilt");
    expect(bad.cards[0].line).toMatch(/next one usually runs \+\d+%/);
    const hot = liveCoach(h, [...base, ...[9500, 9400, 9600].map((ms, i) => at(1e12 + 300_000 + i * 30_000, ms))], opts);
    expect(hot.cards.map((c) => c.kind)).toContain("hot");
  });

  it("still coaches from the sitting alone with no history", () => {
    const fast = [9500, 9400, 9600].map((ms, i) => at(1e12 + i * 30_000, ms));
    const c = liveCoach([], fast, { typicalMs: 10000, bestAo5Ms: null });
    expect(c.profile).toBeNull();
    expect(c.cards[0].kind).toBe("hot");
    expect(liveCoach([], [], { typicalMs: null, bestAo5Ms: null }).cards[0].line).toBe("Fresh start. Ease into it.");
  });

  it("spots the PB average in reach and the fade", () => {
    const four = [9000, 9100, 9200, 12000].map((ms, i) => at(1e12 + i * 30_000, ms));
    const pb = liveCoach(h, four, { typicalMs: 10000, bestAo5Ms: 9300 });
    expect(pb.cards.find((c) => c.kind === "pb")!.line).toMatch(/^A 9\.\d\d or better on the next solve/);

    const long = Array.from({ length: 24 }, (_, i) => at(1e12 + i * 30_000, i < 15 ? 9800 + (i % 3) * 50 : 10700 + (i % 3) * 50));
    expect(liveCoach(h, long, { typicalMs: 10000, bestAo5Ms: null }).cards.map((c) => c.kind)).toContain("fading");
  });
});
