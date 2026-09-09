"use client";

import { useSessionStore } from "@/lib/store/sessionStore";
import { normalSolves } from "@/lib/stats/stats";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { SolveHistogram } from "./SolveHistogram";
import { TimeOfDayChart } from "./TimeOfDayChart";
import { PBHistory } from "./PBHistory";
import { ConsistencyCard } from "./ConsistencyCard";
import { DailyGoalRing } from "./DailyGoalRing";
import { AchievementsPanel } from "./AchievementsPanel";
import { ShareCardButton } from "./ShareCardButton";
import { WeaknessReportCard } from "./WeaknessReportCard";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-2">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

export function InsightsPanel() {
  const rawSolves = useSessionStore((s) => s.solves);
  // Charts and achievements below assume 2-handed timing throughout, so an
  // OH/feet/BLD solve mixed into the same session doesn't show up as a
  // second cluster in the histogram or a weird streak in the heatmap.
  const solves = normalSolves(rawSolves);

  return (
    <div className="flex flex-col gap-3">
      <div className="card rounded-xl p-4">
        <DailyGoalRing />
      </div>
      <div className="card rounded-xl p-4">
        <AchievementsPanel />
      </div>
      <Section title="Consistency">
        <ConsistencyCard solves={solves} />
      </Section>
      <WeaknessReportCard />
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
    </div>
  );
}
