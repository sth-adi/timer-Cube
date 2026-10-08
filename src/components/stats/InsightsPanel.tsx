"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useStatsSolves } from "@/hooks/useStatsSolves";
import { normalSolves } from "@/lib/stats/stats";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { SolveHistogram } from "./SolveHistogram";
import { TimeOfDayChart } from "./TimeOfDayChart";
import { PBHistory } from "./PBHistory";
import { ConsistencyCard } from "./ConsistencyCard";
import { DailyGoalRing } from "./DailyGoalRing";
import { DailyPracticePlanCard } from "./DailyPracticePlanCard";
import { AchievementsPanel } from "./AchievementsPanel";
import { ShareCardButton } from "./ShareCardButton";
import { WeaknessReportCard } from "./WeaknessReportCard";
import { CoachTipCard } from "./CoachTipCard";
import { FaceSpeedFingerprintCard } from "./FaceSpeedFingerprintCard";
import { HeatCubeCard } from "./HeatCubeCard";
import { LookaheadScoreCard } from "./LookaheadScoreCard";
import { EfficiencyQuadrantCard } from "./EfficiencyQuadrantCard";
import { StatTilesGrid } from "./StatTilesGrid";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-[-0.01em]">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function InsightsPanel() {
  // Follows the toggle in StatsPanel, so both panels always describe the same solves.
  // Charts and achievements below assume 2-handed timing throughout, so an
  // OH/feet/BLD solve mixed into the same session doesn't show up as a
  // second cluster in the histogram or a weird streak in the heatmap.
  const { rawSolves, solves } = useStatsSolves();
  // The streak is about practising at all, so it reads every session's 2-handed
  // solves — a fresh session mustn't reset it.
  const allSolves = useSessionStore((s) => s.allSolves);
  const activitySolves = useMemo(() => normalSolves(allSolves), [allSolves]);

  return (
    <div className="card divide-y divide-border rounded-xl px-4 lg:px-5 [&>*]:py-5 [&>:first-child]:pt-4">
      <DailyPracticePlanCard />
      <div>
        <DailyGoalRing />
      </div>
      <div>
        <AchievementsPanel />
      </div>
      <CoachTipCard solves={solves} />
      <Section title="Consistency">
        <ConsistencyCard solves={solves} />
      </Section>
      <WeaknessReportCard />
      <FaceSpeedFingerprintCard solves={solves} />
      <HeatCubeCard solves={solves} />
      <LookaheadScoreCard solves={solves} />
      <EfficiencyQuadrantCard solves={solves} />
      <Section title="Activity">
        <ActivityHeatmap solves={activitySolves} />
      </Section>
      <Section title="Distribution">
        <SolveHistogram solves={solves} />
      </Section>
      <Section title="Time of day">
        <TimeOfDayChart solves={solves} />
      </Section>
      <Section title="Personal bests" action={<ShareCardButton />}>
        <PBHistory solves={solves} />
      </Section>
      <StatTilesGrid solves={solves} rawSolves={rawSolves} />
    </div>
  );
}
