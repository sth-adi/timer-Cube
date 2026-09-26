import type { CoachFinding } from "@/lib/analysis/labCoach";
import { buildMicroscope } from "./algMicroscope";
import { median, mean } from "./common";
import { buildNeutralityReport } from "./neutrality";
import type { SolveXray } from "./solveXray";

/**
 * The X-Ray's four analyses, turned into Coach findings: each one priced
 * in seconds per solve, in the same currency the Coach already ranks
 * everything else in, so they can sit in one list and the first line is
 * the single best thing to practise — whichever analysis found it.
 *
 * Same rule as the Coach: every estimate compares you with yourself (your
 * better quarter of solves, your own typical turn), never with an ideal.
 */

export type XrayFinding = CoachFinding & { source: "xray" };

/** Below this, a finding isn't worth practice time yet (same bar as the Coach). */
const MIN_FINDING_MS = 60;
const s = (ms: number) => (ms / 1000).toFixed(2);
const quantile = (xs: readonly number[], q: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
};

export function buildXrayFindings(results: readonly SolveXray[]): XrayFinding[] {
  const out: XrayFinding[] = [];
  const flows = results.flatMap((r) => (r.flow ? [r.flow] : []));
  const decisions = flows.flatMap((f) => f.decisions);

  // Your real F2L pace, pauses included: what a wasted F2L turn actually costs you.
  const f2lMs = decisions.reduce((a, d) => a + (d.endMs - d.startMs), 0);
  const f2lTurns = decisions.reduce((a, d) => a + d.movesUsed, 0);
  const msPerTurn = f2lTurns > 0 ? f2lMs / f2lTurns : 0;

  if (flows.length >= 5 && msPerTurn > 0) {
    const regretPerSolve = flows.map((f) => f.decisions.reduce((a, d) => a + d.regret, 0));
    const gap = quantile(regretPerSolve, 0.5) - quantile(regretPerSolve, 0.25);
    const worst = [...decisions].sort((a, b) => b.regret - a.regret)[0];
    if (gap > 0 && worst) {
      out.push({
        id: "xray-pair-choice",
        source: "xray",
        title: "Start on the easiest F2L pair",
        detail: `A typical solve spends ${gap.toFixed(1)} more turns on harder-than-necessary pairs than your better quarter does — e.g. ${worst.label} at ${worst.chosenDistance} turns while another pair was ${worst.easiestDistance} away.`,
        action: "During inspection and after each pair, check all four slots before committing.",
        msPerSolve: gap * msPerTurn,
        href: "/xray",
      });
    }

    const netScatter = flows.map((f) => Math.max(0, f.scatter - f.setupGained));
    const scatterGap = quantile(netScatter, 0.5) - quantile(netScatter, 0.25);
    if (scatterGap > 0) {
      out.push({
        id: "xray-scatter",
        source: "xray",
        title: "Stop scattering the pairs you haven't solved yet",
        detail: `While solving one pair, a typical solve pushes the others ${quantile(netScatter, 0.5).toFixed(1)} turns further away; your better quarter, ${quantile(netScatter, 0.25).toFixed(1)}.`,
        action: "Pick insertions that leave the next pair's pieces alone — F2L Flow shows which turns did it.",
        msPerSolve: scatterGap * msPerTurn,
        href: "/xray",
      });
    }
  }

  const oracles = results.flatMap((r) => (r.oracle ? [r.oracle] : []));
  if (oracles.length >= 5 && msPerTurn > 0) {
    // Only clear wins count — an insertion at least 2 turns shorter through OLL.
    const saved = oracles.map((o) => (o.better ? Math.max(0, o.yours.cost - o.better.cost) : 0)).map((t) => (t >= 2 ? t : 0));
    const avg = mean(saved) ?? 0;
    const skips = oracles.filter((o) => o.skipAvailable).length;
    if (avg > 0) {
      out.push({
        id: "xray-last-slot",
        source: "xray",
        title: "Choose a better last-slot insertion",
        detail: `On ${saved.filter((t) => t > 0).length} of ${oracles.length} recent solves a different insert was ${(mean(saved.filter((t) => t > 0)) ?? 0).toFixed(1)} turns shorter through OLL${skips ? `, and ${skips} had an OLL skip one insert away` : ""}.`,
        action: "Open a solve's Last Slot Oracle and learn the inserts it keeps finding.",
        msPerSolve: avg * msPerTurn,
        href: "/xray",
      });
    }
  }

  const solves = results.length;
  const cases = buildMicroscope(results.flatMap((r) => r.executions));
  if (solves >= 5 && cases.length) {
    const stalls = cases
      .flatMap((c) =>
        c.variants.flatMap((v) =>
          v.stall && v.count >= 2 ? [{ c, v, lost: (v.stall.ms * (1 - 1 / v.stall.ratio) * v.count) / solves }] : [],
        ),
      )
      .sort((a, b) => b.lost - a.lost);
    if (stalls.length) {
      const top = stalls.slice(0, 3);
      out.push({
        id: "xray-alg-stall",
        source: "xray",
        title: "Fix the exact turn your algorithms stall on",
        detail: top
          .map((x) => `${x.c.caseName}: turn ${x.v.stall!.index + 1} (${x.v.stall!.token}) takes ${s(x.v.stall!.ms)}s, ${x.v.stall!.ratio.toFixed(1)}× your usual`)
          .join("; "),
        action: "Drill just that transition — the two turns either side — until it flows.",
        msPerSolve: top.reduce((a, x) => a + x.lost, 0),
        href: "/xray",
      });
    }

    for (const step of ["OLL", "PLL"] as const) {
      const ofStep = cases.filter((c) => c.step === step && c.count >= 2);
      const typical = median(ofStep.map((c) => c.meanRecognitionMs));
      if (typical === null || ofStep.length < 3) continue;
      const slow = ofStep
        .map((c) => ({ c, lost: ((c.meanRecognitionMs - typical) * c.count) / solves }))
        .filter((x) => x.c.meanRecognitionMs > typical * 1.4 && x.lost > 0)
        .sort((a, b) => b.lost - a.lost)
        .slice(0, 3);
      if (slow.length) {
        out.push({
          id: `xray-recog-${step.toLowerCase()}`,
          source: "xray",
          title: `Recognize ${slow.length === 1 ? slow[0].c.caseName : `these ${step}s`} faster`,
          detail: `${slow.map((x) => `${x.c.caseName} ${s(x.c.meanRecognitionMs)}s`).join(", ")} to recognize, against your typical ${step} ${s(typical)}s.`,
          action: "Drill them in the Recognize trainer until they're instant.",
          msPerSolve: slow.reduce((a, x) => a + x.lost, 0),
          href: "/xray",
        });
      }
    }
  }

  const neutrality = buildNeutralityReport(results.flatMap((r) => (r.neutrality ? [r.neutrality] : [])));
  if (neutrality && neutrality.solves >= 10 && neutrality.bestSecondColor && neutrality.bestSecondColor.msSaved > 0) {
    const b = neutrality.bestSecondColor;
    out.push({
      id: "xray-neutrality",
      source: "xray",
      title: `Learn a second cross color: ${b.label.replace("White + ", "")}`,
      detail: `On the scrambles you actually solved, it would have given a shorter cross ${Math.round(b.helpedRate * 100)}% of the time — ${b.turnsSaved.toFixed(1)} turns a solve at your own cross pace.`,
      action: "Solve a few crosses in that color every session in the Blind Cross trainer.",
      msPerSolve: b.msSaved,
      href: "/xray",
    });
  }

  return out.filter((f) => f.msPerSolve >= MIN_FINDING_MS).sort((a, b) => b.msPerSolve - a.msPerSolve);
}

/**
 * One ranked list from the Coach's findings and the X-Ray's. Where both
 * describe the same habit — the Coach's "drill the algorithms you don't
 * own yet" and the X-Ray's pinpointed stall — they merge into one entry
 * (the bigger estimate, with the X-Ray's exact turn added), so the same
 * seconds aren't counted twice.
 */
export function mergeFindings(base: readonly CoachFinding[], xray: readonly XrayFinding[]): (CoachFinding & { source?: "xray" })[] {
  const merged: (CoachFinding & { source?: "xray" })[] = base.map((f) => ({ ...f }));
  for (const x of xray) {
    const twin = x.id === "xray-alg-stall" ? merged.find((f) => f.id === "drill-algs") : undefined;
    if (twin) {
      twin.detail = `${twin.detail} Where exactly: ${x.detail}.`;
      twin.msPerSolve = Math.max(twin.msPerSolve, x.msPerSolve);
      continue;
    }
    merged.push(x);
  }
  return merged.sort((a, b) => b.msPerSolve - a.msPerSolve);
}
