import { OLL_CASES } from "./ollData";
import { PLL_CASES } from "./pllData";
import type { AlgCase } from "./types";

/**
 * Looks up a case by the name smartCubeStore's live recognition matched
 * (see lib/analysis/recognize.ts) — that store only keeps the name, not the
 * full case record, so anything that wants the case's algorithm text or a
 * CaseIcon diagram needs to look it back up here. Shared by the live
 * in-solve badges and the post-solve table so both draw from the same
 * source instead of two separate lookups drifting apart.
 */
export function findCase(group: "OLL" | "PLL", name: string): AlgCase | undefined {
  const cases = group === "OLL" ? OLL_CASES : PLL_CASES;
  return cases.find((c) => c.name === name);
}
