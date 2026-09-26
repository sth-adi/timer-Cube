import { solveFinalMs, type Solve } from "@/types";
import type { SolveMetrics } from "@/lib/analytics/solveMetrics";
import { wcaAverage } from "@/lib/comp/round";

/**
 * Quests & Levels: a progression layer over everything the app already
 * records. XP is *derived* from your history — solves, PBs, active days,
 * milestones, gym reps, comp rounds — so it can never drift or be lost,
 * plus a bonus for each weekly quest you claim.
 *
 * Weekly quests are generated from your own data: a volume quest sized
 * from your usual week, a skill quest aimed at your biggest weakness (the
 * Coach's top finding), and a stretch quest just past your current level.
 * Progress is measured straight off this week's solves, gym reps and
 * comp rounds.
 */

export interface XpInput {
  solves: readonly Solve[];
  activeDays: number;
  achievementsUnlocked: number;
  gymReps: readonly { ok: boolean }[];
  compRounds: number;
  claimedQuestXp: number;
}

export interface XpBreakdown {
  total: number;
  parts: { label: string; xp: number }[];
}

export function computeXp(input: XpInput): XpBreakdown {
  const sorted = [...input.solves].sort((a, b) => a.date - b.date);
  let pbs = 0;
  let aoPbs = 0;
  let best = Infinity;
  let bestAo5 = Infinity;
  const finals: (number | null)[] = [];
  let smart = 0;
  for (const s of sorted) {
    const f = solveFinalMs(s);
    finals.push(f);
    if (s.reconstruction && s.moveTimestamps?.length) smart++;
    if (f !== null && f < best) {
      if (best !== Infinity) pbs++;
      best = f;
    }
    if (finals.length >= 5) {
      const a = wcaAverage(finals.slice(-5), "ao5");
      if (typeof a === "number" && a < bestAo5) {
        if (bestAo5 !== Infinity) aoPbs++;
        bestAo5 = a;
      }
    }
  }
  const clean = input.gymReps.filter((r) => r.ok).length;
  const parts = [
    { label: "Solves", xp: sorted.length * 10 },
    { label: "Smart-cube bonus", xp: smart * 5 },
    { label: "Single PBs", xp: pbs * 100 },
    { label: "Ao5 PBs", xp: aoPbs * 50 },
    { label: "Days practised", xp: input.activeDays * 20 },
    { label: "Milestones", xp: input.achievementsUnlocked * 150 },
    { label: "Gym reps", xp: input.gymReps.length * 3 + clean * 2 },
    { label: "Comp rounds", xp: input.compRounds * 60 },
    { label: "Quests", xp: input.claimedQuestXp },
  ].filter((p) => p.xp > 0);
  return { total: parts.reduce((a, p) => a + p.xp, 0), parts };
}

/** XP needed to reach `level` (level 1 is free): 100, 300, 600, 1000, … — each level a little longer than the last. */
export const xpForLevel = (level: number) => 50 * (level - 1) * level;

export interface LevelInfo {
  level: number;
  title: string;
  /** XP into this level, and the size of it. */
  into: number;
  span: number;
}

const TITLES: [number, string][] = [
  [1, "Beginner"],
  [4, "Cuber"],
  [8, "Speedcuber"],
  [13, "Fingertrick Adept"],
  [19, "Lookahead Seer"],
  [26, "Sub-X Hunter"],
  [34, "Cube Virtuoso"],
  [43, "Grandmaster"],
];

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const title = [...TITLES].reverse().find(([l]) => level >= l)![1];
  return { level, title, into: xp - xpForLevel(level), span: xpForLevel(level + 1) - xpForLevel(level) };
}

/** Monday 00:00 local of the week containing `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

export interface Quest {
  id: string;
  kind: "volume" | "skill" | "stretch";
  title: string;
  detail: string;
  target: number;
  progress: number;
  xp: number;
  done: boolean;
}

export interface QuestInput {
  now: number;
  solves: readonly Solve[];
  metrics: readonly SolveMetrics[];
  gymReps: readonly { ok: boolean; at: number }[];
  compRoundDates: readonly number[];
  /** The Coach's top finding id (e.g. "f2l-pauses", "drill-algs"), if any. */
  topFinding: string | null;
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const s1 = (ms: number) => (ms / 1000).toFixed(1);
const cap = (q: Omit<Quest, "done">): Quest => ({ ...q, progress: Math.min(q.progress, q.target), done: q.progress >= q.target });

export function weeklyQuests(input: QuestInput): Quest[] {
  const start = weekStart(input.now);
  const week = input.solves.filter((s) => s.date >= start && s.date <= input.now);
  const before = input.solves.filter((s) => s.date < start);
  const weekKey = new Date(start).toISOString().slice(0, 10);

  // Volume: a bit more than your usual week (over the last four), never less than 25.
  const recentWeeks = [1, 2, 3, 4].map((w) => before.filter((s) => s.date >= start - w * 7 * 864e5 && s.date < start - (w - 1) * 7 * 864e5).length);
  const usual = recentWeeks.reduce((a, b) => a + b, 0) / 4;
  const volumeTarget = Math.max(25, Math.round((usual * 1.2) / 5) * 5);
  const quests: Quest[] = [
    cap({ id: `${weekKey}:volume`, kind: "volume", title: `Solve ${volumeTarget} times this week`, detail: `A little more than your usual ${Math.round(usual)}.`, target: volumeTarget, progress: week.length, xp: 150 }),
  ];

  // Skill: aimed at the Coach's top finding, measured on this week's smart-cube solves or gym reps.
  const weekMetrics = input.metrics.filter((m) => m.date >= start && m.date <= input.now);
  const pastMetrics = input.metrics.filter((m) => m.date < start);
  const f = input.topFinding ?? "";
  if ((f === "two-look" || f === "drill-algs") && input.gymReps) {
    const clean = input.gymReps.filter((r) => r.ok && r.at >= start && r.at <= input.now).length;
    quests.push(cap({ id: `${weekKey}:gym`, kind: "skill", title: "30 clean Alg Gym reps", detail: "Your last layer is where the Coach says you lose the most — drill it on the cube.", target: 30, progress: clean, xp: 200 }));
  } else if ((f === "f2l-pauses" || f === "lookahead") && pastMetrics.length >= 5) {
    const bar = median(pastMetrics.map((m) => m.f2lPauseMs)) * 0.8;
    const hit = weekMetrics.filter((m) => m.f2lPauseMs <= bar).length;
    quests.push(cap({ id: `${weekKey}:f2lpause`, kind: "skill", title: `10 solves with under ${s1(bar)}s of F2L pausing`, detail: "Pausing between pairs is your biggest leak — keep turning, look ahead.", target: 10, progress: hit, xp: 200 }));
  } else if (pastMetrics.length >= 5) {
    const bar = median(pastMetrics.map((m) => m.phases[0])) * 0.85;
    const hit = weekMetrics.filter((m) => m.phases[0] <= bar).length;
    quests.push(cap({ id: `${weekKey}:cross`, kind: "skill", title: `15 crosses under ${s1(bar)}s`, detail: "Plan the whole cross in inspection, then execute without stopping.", target: 15, progress: hit, xp: 200 }));
  } else {
    const rounds = input.compRoundDates.filter((d) => d >= start && d <= input.now).length;
    quests.push(cap({ id: `${weekKey}:comp`, kind: "skill", title: "Finish 2 Comp Sim rounds", detail: "Practise under pressure — judge calls, official average.", target: 2, progress: rounds, xp: 200 }));
  }

  // Stretch: beat your best Ao5 from before this week (or, early on, set a first one).
  const finalsBefore = before.sort((a, b) => a.date - b.date).map(solveFinalMs);
  let bestAo5 = Infinity;
  for (let i = 5; i <= finalsBefore.length; i++) {
    const a = wcaAverage(finalsBefore.slice(i - 5, i), "ao5");
    if (typeof a === "number") bestAo5 = Math.min(bestAo5, a);
  }
  const weekFinals = week.sort((a, b) => a.date - b.date).map(solveFinalMs);
  let beat = 0;
  for (let i = 5; i <= weekFinals.length; i++) {
    const a = wcaAverage(weekFinals.slice(i - 5, i), "ao5");
    if (typeof a === "number" && a < bestAo5) beat = 1;
  }
  quests.push(
    cap({
      id: `${weekKey}:ao5pb`,
      kind: "stretch",
      title: Number.isFinite(bestAo5) ? `Beat your best Ao5 (${(bestAo5 / 1000).toFixed(2)})` : "Get your first Ao5",
      detail: "Five in a row, best and worst dropped.",
      target: 1,
      progress: Number.isFinite(bestAo5) ? beat : weekFinals.length >= 5 ? 1 : 0,
      xp: 300,
    }),
  );
  return quests;
}
