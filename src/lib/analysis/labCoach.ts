import type { Solve } from "@/types";
import { metricsFor, quantile, type SolveMetrics } from "@/lib/analytics/solveMetrics";
import { aggregateMistakes, analyzeMistakes, type MistakeHabit } from "@/lib/analysis/mistakeRadar";
import { analyzeF2lConsistency, type F2lConsistencyReport } from "@/lib/analysis/f2lConsistency";
import { analyzeAlgSpeed, type AlgSpeedReport } from "@/lib/analysis/algSpeed";
import { analyzeLookahead, type LookaheadReport } from "@/lib/analysis/lookahead";
import { defaultTargetMs, planGoal, typicalSolveMs, type GoalPlan } from "@/lib/analysis/goalPlanner";

/**
 * Coach: the Lab has dozens of reports; this reads the ones that can put a
 * number of seconds on a fix, and ranks the fixes by how much a solve they
 * are worth. Every estimate is measured against something you've already
 * done — your own best on a case, your own pace, your better quarter of
 * solves — so a finding is never "be faster", always "do what you already
 * do on good days, more often". Findings can overlap a little (a two-look
 * OLL also shows as a long pause), so the total is an upper bound.
 */

export interface CoachFinding {
  id: string;
  title: string;
  detail: string;
  /** What to practise. */
  action: string;
  msPerSolve: number;
  href: string;
}

export interface CoachReport {
  solves: number;
  typicalMs: number;
  findings: CoachFinding[];
  goal: GoalPlan | null;
  headline: string;
}

export interface CoachInputs {
  metrics: readonly SolveMetrics[];
  habits: readonly MistakeHabit[];
  f2l: F2lConsistencyReport | null;
  alg: AlgSpeedReport | null;
  look: LookaheadReport | null;
}

export const MIN_SOLVES = 20;
/** Findings worth less than this a solve aren't worth your practice time yet. */
const MIN_FINDING_MS = 60;
const s = (ms: number) => (ms / 1000).toFixed(2);
const list = (names: readonly string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? ""));

/** Pure: ranks findings from already-built reports, so it's testable without replaying a solve. */
export function buildCoach({ metrics, habits, f2l, alg, look }: CoachInputs): CoachReport | null {
  if (metrics.length < MIN_SOLVES) return null;
  const findings: CoachFinding[] = [];

  if (alg) {
    const twoLook = alg.flagged.filter((a) => a.verdict === "two-look");
    if (twoLook.length) {
      const top = twoLook.slice(0, 3);
      findings.push({
        id: "two-look",
        title: `Learn the one-look ${top.every((a) => a.group === "PLL") ? "PLL" : top.every((a) => a.group === "OLL") ? "OLL" : "algorithm"} for your most common two-look cases`,
        detail: `${list(top.map((a) => a.name))} take you two algorithms and a second look.`,
        action: `Learn ${top.length === 1 ? "it" : "them"} one at a time in the Alg Gym.`,
        msPerSolve: twoLook.reduce((x, a) => x + a.lostMsPerSolve, 0),
        href: "/algspeed",
      });
    }
    const drill = alg.flagged.filter((a) => a.verdict === "hesitates" || a.verdict === "slow-hands");
    if (drill.length) {
      const top = drill.slice(0, 3);
      findings.push({
        id: "drill-algs",
        title: "Drill the algorithms you know but don't own yet",
        detail: `${list(top.map((a) => a.name))} ${top.length === 1 ? "is" : "are"} slower than the rest of your last layer — stops partway, or slow fingers.`,
        action: "Repeat each until it runs start to finish without a stop.",
        msPerSolve: drill.reduce((x, a) => x + a.lostMsPerSolve, 0),
        href: "/algspeed",
      });
    }
  }

  if (f2l && f2l.worst.length) {
    const top = f2l.worst.slice(0, 3);
    findings.push({
      id: "f2l-cases",
      title: "Settle one algorithm for your least consistent F2L cases",
      detail: `"${top[0].name}": you've done it in ${top[0].bestTurns} turns but usually take ${top[0].medianTurns.toFixed(0)}.`,
      action: "Pick your best version of each and drill it in the F2L trainer.",
      msPerSolve: f2l.lostMsPerSolve,
      href: "/f2lcases",
    });
  }

  const f2lPause = metrics.map((m) => m.f2lPauseMs);
  const pauseGap = quantile(f2lPause, 0.5) - quantile(f2lPause, 0.25);
  if (pauseGap > 0) {
    findings.push({
      id: "f2l-pauses",
      title: "Pause less between F2L pairs",
      detail: `A typical solve spends ${s(quantile(f2lPause, 0.5))}s paused during F2L; your better quarter spends ${s(quantile(f2lPause, 0.25))}s.`,
      action:
        look?.verdict === "no-link"
          ? "You don't look ahead while turning yet — during each pair, find the next one before you finish."
          : "Use the F2L Pause Map drill on the hand-offs that stall you most.",
      msPerSolve: pauseGap,
      href: "/blindspots",
    });
  }

  if (look?.verdict === "slow-down") {
    findings.push({
      id: "lookahead",
      title: "Turn F2L pairs a little slower to look ahead",
      detail: look.headline,
      action: "Practise F2L at a steady, calm pace — no stops.",
      msPerSolve: look.netGainMs * look.handoffsPerSolve,
      href: "/lookahead",
    });
  }

  const habit = habits.find((h) => h.kind !== "extra-oll-look" && h.kind !== "extra-pll-look");
  if (habit) {
    findings.push({
      id: `mistake-${habit.kind}`,
      title: `Cut down on: ${habit.label.toLowerCase()}`,
      detail: `${habit.occurrences} times across ${habit.solvesAffected} solves.`,
      action: "Replay the flagged moments in Mistake Radar to see where they happen.",
      msPerSolve: habit.costPerSolveMs,
      href: "/lab",
    });
  }

  const ranked = findings.filter((f) => f.msPerSolve >= MIN_FINDING_MS).sort((a, b) => b.msPerSolve - a.msPerSolve);
  const typicalMs = quantile(
    metrics.map((m) => m.totalMs),
    0.5,
  );
  const goal = planGoal(metrics, defaultTargetMs(typicalSolveMs(metrics)));

  const top3 = ranked.slice(0, 3).reduce((x, f) => x + f.msPerSolve, 0);
  const headline = ranked.length
    ? `Your biggest lever: ${ranked[0].title.charAt(0).toLowerCase()}${ranked[0].title.slice(1)} — about ${s(ranked[0].msPerSolve)}s a solve.${ranked.length > 1 ? ` Your top ${Math.min(3, ranked.length)} fixes are worth up to ${s(top3)}s together.` : ""}`
    : "Nothing stands out — every part of your solve is close to your own good-day level. Pick a goal below and push the phase it asks for.";

  return { solves: metrics.length, typicalMs, findings: ranked, goal, headline };
}

export function analyzeCoach(solves: readonly Solve[]): CoachReport | null {
  const metrics = metricsFor(solves);
  if (metrics.length < MIN_SOLVES) return null;
  const reports = solves
    .filter((x) => x.scramble && x.reconstruction && x.moveTimestamps && x.penalty !== "dnf")
    .map((x) => analyzeMistakes({ scramble: x.scramble, moves: x.reconstruction!.split(/\s+/).filter(Boolean), timesMs: x.moveTimestamps!, totalMs: x.timeMs }));
  return buildCoach({ metrics, habits: aggregateMistakes(reports), f2l: analyzeF2lConsistency(solves), alg: analyzeAlgSpeed(solves), look: analyzeLookahead(solves) });
}
