import { describe, expect, it } from "vitest";
import { generateCoachReport, coachInputFromPostSolveRows, type CoachInput } from "./coach";

function baseInput(overrides: Partial<CoachInput> = {}): CoachInput {
  return {
    totalMs: 15000,
    tps: 4.5,
    phases: [
      { label: "Cross", totalMs: 2000, recognitionMs: 0, executionMs: 2000 },
      { label: "F2L 1", totalMs: 3000, recognitionMs: 300, executionMs: 2700 },
      { label: "OLL", totalMs: 2500, recognitionMs: 200, executionMs: 2300 },
      { label: "PLL", totalMs: 2000, recognitionMs: 150, executionMs: 1850 },
    ],
    sessionMeanMs: 15000,
    isNewPB: false,
    ...overrides,
  };
}

describe("generateCoachReport", () => {
  it("always returns a non-empty headline and at least one paragraph", () => {
    const report = generateCoachReport(baseInput());
    expect(report.headline.length).toBeGreaterThan(0);
    expect(report.paragraphs.length).toBeGreaterThan(0);
  });

  it("is deterministic — the same input always produces the same report", () => {
    const a = generateCoachReport(baseInput());
    const b = generateCoachReport(baseInput());
    expect(a).toEqual(b);
  });

  it("picks the phase with the longest recognition pause as the focus phase", () => {
    const report = generateCoachReport(
      baseInput({
        phases: [
          { label: "Cross", totalMs: 2000, recognitionMs: 0, executionMs: 2000 },
          { label: "F2L 1", totalMs: 3000, recognitionMs: 300, executionMs: 2700 },
          { label: "OLL", totalMs: 4500, recognitionMs: 2200, executionMs: 2300 },
          { label: "PLL", totalMs: 2000, recognitionMs: 150, executionMs: 1850 },
        ],
      }),
    );
    expect(report.focusPhase).toBe("OLL");
  });

  it("names the biggest-recognition phase somewhere in the prose", () => {
    const report = generateCoachReport(
      baseInput({
        phases: [
          { label: "Cross", totalMs: 2000, recognitionMs: 0, executionMs: 2000 },
          { label: "PLL", totalMs: 5000, recognitionMs: 3000, executionMs: 2000 },
        ],
      }),
    );
    expect(report.paragraphs.some((p) => p.includes("PLL"))).toBe(true);
  });

  it("leaves focusPhase null when no phase has a meaningful recognition pause", () => {
    const report = generateCoachReport(
      baseInput({
        phases: [
          { label: "Cross", totalMs: 2000, recognitionMs: 0, executionMs: 2000 },
          { label: "F2L 1", totalMs: 3000, recognitionMs: 50, executionMs: 2950 },
        ],
      }),
    );
    expect(report.focusPhase).toBeNull();
  });

  it("never flags a phase without a recognition split as the bottleneck", () => {
    const report = generateCoachReport(
      baseInput({
        phases: [
          { label: "Cross", totalMs: 8000, recognitionMs: null, executionMs: null },
          { label: "F2L 1", totalMs: 3000, recognitionMs: 900, executionMs: 2100 },
        ],
      }),
    );
    expect(report.focusPhase).toBe("F2L 1");
  });

  it("doesn't call a pause shorter than a real look a recognition problem", () => {
    const report = generateCoachReport(
      baseInput({
        phases: [
          { label: "Cross", totalMs: 1500, recognitionMs: 0, executionMs: 1500 },
          { label: "PLL", totalMs: 2000, recognitionMs: 230, executionMs: 1770 },
        ],
      }),
    );
    expect(report.focusPhase).toBeNull();
    expect(report.paragraphs.join(" ")).not.toMatch(/recogni/i);
  });

  it("picks a PB headline whenever isNewPB is true, regardless of pace vs. average", () => {
    const report = generateCoachReport(baseInput({ isNewPB: true, totalMs: 20000, sessionMeanMs: 10000 }));
    expect(["New personal best — that's the one.", "PB! That solve just rewrote your record.", "Brand new best single. Nice work."]).toContain(
      report.headline,
    );
  });

  it("mentions the percentage difference when clearly faster or slower than the session mean", () => {
    const faster = generateCoachReport(baseInput({ totalMs: 8000, sessionMeanMs: 10000 }));
    expect(faster.paragraphs.some((p) => p.includes("faster"))).toBe(true);

    const slower = generateCoachReport(baseInput({ totalMs: 12000, sessionMeanMs: 10000 }));
    expect(slower.paragraphs.some((p) => p.includes("slower"))).toBe(true);
  });

  it("says nothing about pace comparison when there's no session history yet", () => {
    const report = generateCoachReport(baseInput({ sessionMeanMs: null }));
    expect(report.paragraphs.some((p) => p.includes("session average"))).toBe(false);
  });

  it("falls back to a single generic paragraph when there's no phase data at all", () => {
    const report = generateCoachReport(baseInput({ phases: [], sessionMeanMs: null, tps: null }));
    expect(report.paragraphs).toEqual(["Not enough phase detail on this solve to break down further — the overall time is the whole story here."]);
  });
});

describe("coachInputFromPostSolveRows", () => {
  it("maps row fields straight across into CoachInput", () => {
    const input = coachInputFromPostSolveRows(
      [{ label: "Cross", totalMs: 1000, recognitionMs: 0, executionMs: 1000 }],
      15000,
      4.2,
      14000,
      false,
    );
    expect(input).toEqual({
      totalMs: 15000,
      tps: 4.2,
      phases: [{ label: "Cross", totalMs: 1000, recognitionMs: 0, executionMs: 1000 }],
      sessionMeanMs: 14000,
      isNewPB: false,
    });
  });
});
