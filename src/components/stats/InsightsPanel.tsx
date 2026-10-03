"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { scopedSolves } from "@/lib/stats/scope";
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
import { LookaheadScoreCard } from "./LookaheadScoreCard";
import { EfficiencyQuadrantCard } from "./EfficiencyQuadrantCard";
import { StatTilesGrid } from "./StatTilesGrid";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          <span aria-hidden className="h-3 w-0.5 rounded-full bg-accent" />
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

export function InsightsPanel() {
  const sessionSolves = useSessionStore((s) => s.solves);
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const scope = useSettingsStore((s) => s.statsScope);
  // Follows the toggle in StatsPanel, so both panels always describe the same solves.
  const rawSolves = useMemo(
    () => scopedSolves(scope, activeSessionId, sessions, sessionSolves, allSolves),
    [scope, activeSessionId, sessions, sessionSolves, allSolves],
  );
  // Charts and achievements below assume 2-handed timing throughout, so an
  // OH/feet/BLD solve mixed into the same session doesn't show up as a
  // second cluster in the histogram or a weird streak in the heatmap.
  const solves = normalSolves(rawSolves);

  return (
    <div className="flex flex-col gap-3">
      <DailyPracticePlanCard />
      <div className="card rounded-xl p-4">
        <DailyGoalRing />
      </div>
      <div className="card rounded-xl p-4">
        <AchievementsPanel />
      </div>
      <CoachTipCard solves={solves} />
      <Section title="Consistency">
        <ConsistencyCard solves={solves} />
      </Section>
      <WeaknessReportCard />
      <FaceSpeedFingerprintCard solves={solves} />
      <LookaheadScoreCard solves={solves} />
      <EfficiencyQuadrantCard solves={solves} />
      <Section title="Activity">
        <ActivityHeatmap solves={solves} />
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
