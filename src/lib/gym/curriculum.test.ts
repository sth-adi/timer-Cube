import { describe, expect, it } from "vitest";
import type { AlgSpeed, AlgSpeedReport } from "@/lib/analysis/algSpeed";
import type { CaseOccurrence } from "@/lib/analysis/caseHistory";
import type { SolveMetrics } from "@/lib/analytics/solveMetrics";
import { candidateBlocks, planCurriculum, type CurriculumInput } from "./curriculum";

const base: CurriculumInput = { alg: null, occurrences: [], solves: 0, f2l: null, look: null, metrics: [], gym: {}, minutes: 20 };

const algSpeed = (algs: Partial<AlgSpeed>[]): AlgSpeedReport =>
  ({ flagged: algs.map((a) => ({ group: "PLL", verdict: "hesitates", lostMsPerSolve: 100, ...a })) }) as unknown as AlgSpeedReport;

const occ = (group: "OLL" | "PLL", name: string, recognitionMs: number): CaseOccurrence => ({
  group,
  key: name,
  name,
  solveId: "x",
  date: 0,
  recognitionMs,
  executionMs: 1000,
  turns: 10,
  execPauseMs: 0,
});

describe("curriculum", () => {
  it("gives a new cuber a balanced starter session that fits the time", () => {
    const plan = planCurriculum(base);
    expect(plan.map((b) => b.kind)).toEqual(["gym", "recognize", "cross"]);
    expect(plan.reduce((a, b) => a + b.minutes, 0)).toBe(20);
  });

  it("turns slow algorithms into an on-cube gym block with those cases", () => {
    const plan = planCurriculum({ ...base, alg: algSpeed([{ name: "Gb-Perm", lostMsPerSolve: 300 }, { name: "Ja-Perm", lostMsPerSolve: 100 }]) });
    expect(plan[0]).toMatchObject({ kind: "gym", cases: [{ group: "PLL", name: "Gb-Perm" }, { group: "PLL", name: "Ja-Perm" }] });
    expect(plan[0].reps).toBe(plan[0].minutes * 3);
  });

  it("finds slow-to-recognize cases from real solves", () => {
    const occurrences = [
      ...["T", "Y", "Ua"].flatMap((n) => [occ("PLL", n, 600), occ("PLL", n, 600)]),
      occ("PLL", "Gb", 2000),
      occ("PLL", "Gb", 2000),
    ];
    const blocks = candidateBlocks({ ...base, occurrences, solves: 8 });
    const rec = blocks.find((b) => b.kind === "recognize")!;
    expect(rec.cases).toEqual([{ group: "PLL", name: "Gb" }]);
    // (2000 − typical 600) × 2 occurrences / 8 solves.
    expect(rec.msPerSolve).toBeCloseTo((1400 * 2) / 8);
  });

  it("flags gym cases you keep missing", () => {
    const blocks = candidateBlocks({ ...base, gym: { "PLL:Na-Perm": { attempts: 8, successes: 4, bestMs: 2000, recentMs: [], recentRecogMs: [] } } });
    expect(blocks[0]).toMatchObject({ id: "gym-shaky", cases: [{ group: "PLL", name: "Na-Perm" }] });
  });

  it("shares minutes in proportion to what each block is worth, never under 2", () => {
    const metrics = Array.from({ length: 12 }, (_, i) => ({ phases: [2000 + i * 100, 0, 0, 0] }) as unknown as SolveMetrics);
    const plan = planCurriculum({ ...base, minutes: 20, metrics, alg: algSpeed([{ name: "Gb-Perm", lostMsPerSolve: 2000 }]) });
    const [gym, cross] = plan;
    expect(gym.kind).toBe("gym");
    expect(cross.kind).toBe("cross");
    expect(gym.minutes).toBeGreaterThan(cross.minutes);
    expect(cross.minutes).toBeGreaterThanOrEqual(2);
    expect(plan.reduce((a, b) => a + b.minutes, 0)).toBeLessThanOrEqual(20);
  });
});
