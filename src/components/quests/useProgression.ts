"use client";

import { useMemo, useState } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useGymStore } from "@/lib/store/gymStore";
import { useCompStore } from "@/lib/store/compStore";
import { useQuestStore } from "@/lib/store/questStore";
import { achievementSolves, computeAchievements, computeActivity } from "@/lib/stats/stats";
import { metricsFor } from "@/lib/analytics/solveMetrics";
import { analyzeCoach } from "@/lib/analysis/labCoach";
import { computeXp, levelInfo, weeklyQuests } from "@/lib/quests/quests";

/** Everything the progression layer shows, derived from the stores in one place. */
export function useProgression(withQuests = true) {
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  const gymLog = useGymStore((s) => s.log);
  const rounds = useCompStore((s) => s.rounds);
  const claimed = useQuestStore((s) => s.claimed);
  const [now] = useState(() => Date.now());

  // XP, streak days and quests count 3x3 normal solves only — the same list the achievements use — so
  // a 2x2 / OH / BLD solve doesn't earn XP or progress a 3x3 quest.
  const solves = useMemo(() => achievementSolves(allSolves, sessions), [allSolves, sessions]);
  const achievements = useMemo(() => computeAchievements(solves), [solves]);
  const activity = useMemo(() => computeActivity(solves), [solves]);
  const xp = useMemo(
    () =>
      computeXp({
        solves,
        activeDays: activity.days.length,
        achievementsUnlocked: achievements.filter((a) => a.unlocked).length,
        gymReps: gymLog,
        compRounds: rounds.length,
        claimedQuestXp: Object.values(claimed).reduce((a, b) => a + b, 0),
      }),
    [solves, activity, achievements, gymLog, rounds, claimed],
  );
  const level = levelInfo(xp.total);

  const quests = useMemo(() => {
    if (!withQuests) return [];
    const metrics = metricsFor(solves);
    const coach = analyzeCoach(solves);
    return weeklyQuests({ now, solves, metrics, gymReps: gymLog, compRoundDates: rounds.map((r) => r.date), topFinding: coach?.findings[0]?.id ?? null });
  }, [withQuests, solves, gymLog, rounds, now]);

  return { xp, level, quests, claimed, achievements, now };
}
