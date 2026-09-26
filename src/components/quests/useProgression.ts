"use client";

import { useMemo, useState } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useGymStore } from "@/lib/store/gymStore";
import { useCompStore } from "@/lib/store/compStore";
import { useQuestStore } from "@/lib/store/questStore";
import { computeAchievements, computeActivity } from "@/lib/stats/stats";
import { metricsFor } from "@/lib/analytics/solveMetrics";
import { analyzeCoach } from "@/lib/analysis/labCoach";
import { computeXp, levelInfo, weeklyQuests } from "@/lib/quests/quests";

/** Everything the progression layer shows, derived from the stores in one place. */
export function useProgression(withQuests = true) {
  const allSolves = useSessionStore((s) => s.allSolves);
  const gymLog = useGymStore((s) => s.log);
  const rounds = useCompStore((s) => s.rounds);
  const claimed = useQuestStore((s) => s.claimed);
  const [now] = useState(() => Date.now());

  const achievements = useMemo(() => computeAchievements(allSolves), [allSolves]);
  const activity = useMemo(() => computeActivity(allSolves), [allSolves]);
  const xp = useMemo(
    () =>
      computeXp({
        solves: allSolves,
        activeDays: activity.days.length,
        achievementsUnlocked: achievements.filter((a) => a.unlocked).length,
        gymReps: gymLog,
        compRounds: rounds.length,
        claimedQuestXp: Object.values(claimed).reduce((a, b) => a + b, 0),
      }),
    [allSolves, activity, achievements, gymLog, rounds, claimed],
  );
  const level = levelInfo(xp.total);

  const quests = useMemo(() => {
    if (!withQuests) return [];
    const metrics = metricsFor(allSolves);
    const coach = analyzeCoach(allSolves);
    return weeklyQuests({ now, solves: allSolves, metrics, gymReps: gymLog, compRoundDates: rounds.map((r) => r.date), topFinding: coach?.findings[0]?.id ?? null });
  }, [withQuests, allSolves, gymLog, rounds, now]);

  return { xp, level, quests, claimed, achievements, now };
}
