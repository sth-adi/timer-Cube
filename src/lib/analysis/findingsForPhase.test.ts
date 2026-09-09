import { describe, expect, it } from "vitest";
import { findingsForPhase, type Finding, type PhaseAnalysis } from "./analyze";

const emptyMetrics = { stm: 0, etm: 0, qtm: 0, rotations: 0 };

function phase(overrides: Partial<PhaseAnalysis>): PhaseAnalysis {
  return {
    phase: "cross",
    label: "Cross",
    moves: [],
    metrics: emptyMetrics,
    model: null,
    lost: null,
    ...overrides,
  };
}

function finding(overrides: Partial<Finding>): Finding {
  return { id: "x", severity: "medium", title: "t", detail: "d", ...overrides };
}

// The suffix pattern this test protects is a duplicate of the one
// buildFindings() in analyze.ts actually emits (cross-*, f2l-worst-<slot>,
// ${phase}-skip/-long/-clean). If either side drifts, a phase's commentary
// silently goes blank instead of erroring, so this is worth pinning directly.
describe("findingsForPhase", () => {
  it("matches a cross finding to the cross segment", () => {
    const crossLong = finding({ id: "cross-long", phase: "cross" });
    const unrelated = finding({ id: "rotations" });
    expect(findingsForPhase(phase({ phase: "cross" }), [crossLong, unrelated])).toEqual([crossLong]);
  });

  it("matches an f2l finding to the specific slot it names, not other slots", () => {
    const worstBR = finding({ id: "f2l-worst-BR", phase: "f2l" });
    const fr = phase({ phase: "f2l", label: "F2L 2", slot: "FR" });
    const br = phase({ phase: "f2l", label: "F2L 1", slot: "BR" });
    expect(findingsForPhase(fr, [worstBR])).toEqual([]);
    expect(findingsForPhase(br, [worstBR])).toEqual([worstBR]);
  });

  it("excludes the aggregate f2l-total from any single slot", () => {
    const total = finding({ id: "f2l-total", phase: "f2l" });
    expect(findingsForPhase(phase({ phase: "f2l", slot: "FL" }), [total])).toEqual([]);
  });

  it("matches oll/pll skip, long and clean findings by phase, not by each other", () => {
    const ollLong = finding({ id: "oll-long", phase: "oll" });
    const pllSkip = finding({ id: "pll-skip", phase: "pll" });
    expect(findingsForPhase(phase({ phase: "oll" }), [ollLong, pllSkip])).toEqual([ollLong]);
    expect(findingsForPhase(phase({ phase: "pll" }), [ollLong, pllSkip])).toEqual([pllSkip]);
  });

  it("returns nothing for a phase with no matching finding", () => {
    const cancellations = finding({ id: "cancellations" });
    expect(findingsForPhase(phase({ phase: "cross" }), [cancellations])).toEqual([]);
  });
});
