import { describe, expect, it } from "vitest";
import type { PhaseAnalysis } from "@/lib/analysis/analyze";
import { buildDirectorsCut, readingMs } from "./directorsCut";

const phase = (label: string, n: number, lost: number | null, extra: Partial<PhaseAnalysis> = {}): PhaseAnalysis =>
  ({ phase: "cross", label, moves: Array.from({ length: n }, () => "R"), metrics: {}, model: lost === null ? null : { moves: [], metrics: {}, optimal: true }, lost, ...extra }) as unknown as PhaseAnalysis;

describe("Director's Cut", () => {
  const phases = [phase("Cross", 3, 0), phase("F2L", 2, 5, { slot: "FR" }), phase("OLL", 0, null, { skipped: true }), phase("PLL", 2, 0, { caseName: "T Perm" })];

  it("puts one cue at the start of every phase that has moves, plus a wrap", () => {
    const cues = buildDirectorsCut(phases, []);
    expect(cues.map((c) => c.moveIndex)).toEqual([0, 3, 5, 6]);
    expect(cues[1].title).toBe("F2L FR");
    expect(cues[1].line).toMatch(/5 turns longer than the shortest/);
    expect(cues[2].line).toMatch(/T Perm/);
    expect(cues[3].line).toMatch(/redo: F2L FR/);
  });

  it("speaks each phase's real time when the solve was captured live", () => {
    const ts = [300, 600, 900, 2000, 2400, 3000, 3200];
    const cues = buildDirectorsCut(phases, [], ts, 3500);
    expect(cues[0].line).toMatch(/0\.9 seconds, 3 turns/);
    expect(cues[1].line).toMatch(/1\.5 seconds, 2 turns/);
    expect(cues[3].line).toMatch(/^3\.5 seconds/);
  });

  it("ignores timestamps that don't line up with the moves", () => {
    const cues = buildDirectorsCut(phases, [], [1, 2, 3]);
    expect(cues[0].line).not.toMatch(/seconds/);
  });

  it("names a flagged phase as the one to redo, even with no turn count against it", () => {
    const ps = [phase("Cross", 3, 0), phase("OLL", 4, null, { phase: "oll" } as Partial<PhaseAnalysis>)];
    const findings = [{ id: "oll-long", severity: "high" as const, phase: "oll" as const, title: "OLL took 21 moves" }];
    const cues = buildDirectorsCut(ps, findings as never);
    expect(cues[cues.length - 1].line).toMatch(/redo: OLL/);
  });

  it("gives a line enough time to be read", () => {
    expect(readingMs("Hi")).toBe(1400);
    expect(readingMs("one two three four five six seven eight nine ten eleven twelve thirteen")).toBeGreaterThan(4000);
  });
});
