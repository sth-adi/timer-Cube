"use client";

import { useSessionStore } from "@/lib/store/sessionStore";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { SolveHistogram } from "./SolveHistogram";
import { TimeOfDayChart } from "./TimeOfDayChart";
import { PBHistory } from "./PBHistory";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card rounded-xl p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-2">{title}</p>
      {children}
    </div>
  );
}

export function InsightsPanel() {
  const solves = useSessionStore((s) => s.solves);

  return (
    <div className="flex flex-col gap-3">
      <Section title="Activity">
        <ActivityHeatmap solves={solves} />
      </Section>
      <Section title="Distribution">
        <SolveHistogram solves={solves} />
      </Section>
      <Section title="Time of day">
        <TimeOfDayChart solves={solves} />
      </Section>
      <Section title="Personal bests">
        <PBHistory solves={solves} />
      </Section>
    </div>
  );
}
