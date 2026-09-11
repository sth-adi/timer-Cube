"use client";

import { useMemo } from "react";
import { ArrowRight, ListChecks } from "lucide-react";
import { useAlgorithmStore } from "@/lib/store/algorithmStore";
import { useTrainerStore } from "@/lib/store/trainerStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore, PHASE_LABELS, type PhaseCount } from "@/lib/store/settingsStore";
import { useNavigationStore } from "@/lib/store/navigationStore";
import { computePhaseSplits, normalSolves } from "@/lib/stats/stats";
import { buildDailyPlan } from "@/lib/analysis/dailyPlan";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * A short, ranked "what to actually do today" list, built entirely from data
 * this app already tracks — due spaced-repetition reviews, which last-layer
 * trainer mode has fewer reps, how far a phase's average sits above its own
 * best, today's solve count against the daily goal. Unlike the Weakness
 * report (which re-runs the analyzer on saved reconstructions on demand),
 * this needs no opt-in step and updates live.
 */
export function DailyPracticePlanCard() {
  // Selecting `progress` (even though dueCaseIds reads it via closure) is
  // what makes this component re-render when SRS progress changes elsewhere
  // — dueCaseIds itself is a stable function reference.
  useAlgorithmStore((s) => s.progress);
  const dueCaseIds = useAlgorithmStore((s) => s.dueCaseIds);
  const dueAlgCount = dueCaseIds().length;

  const trainerTimes = useTrainerStore((s) => s.times);

  const solves = useSessionStore((s) => s.solves);
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  const phaseCount = useSettingsStore((s) => s.phaseCount);
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);
  const requestNavigate = useNavigationStore((s) => s.requestNavigate);

  const phaseSplit = useMemo(() => {
    if (phaseCount <= 1) return null;
    const matching = normalSolves(solves).filter((s) => (s.splits?.length ?? 0) + 1 === phaseCount);
    return computePhaseSplits(matching, (n) => PHASE_LABELS[n as PhaseCount] ?? []);
  }, [solves, phaseCount]);

  const solvesToday = useMemo(() => {
    const key = todayKey();
    return allSolves.filter((s) => {
      const d = new Date(s.date);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key;
    }).length;
  }, [allSolves]);

  const eventsPracticed = useMemo(() => [...new Set(sessions.map((s) => s.event))], [sessions]);

  const plan = useMemo(
    () =>
      buildDailyPlan({
        dueAlgCount,
        phases: phaseSplit?.phases ?? null,
        phaseSampleSize: phaseSplit?.sampleSize ?? 0,
        trainerTimes,
        solvesToday,
        dailyGoal,
        eventsPracticed,
      }),
    [dueAlgCount, phaseSplit, trainerTimes, solvesToday, dailyGoal, eventsPracticed],
  );

  if (plan.length === 0) return null;

  return (
    <div className="card rounded-xl border-accent/30 bg-accent-soft/30 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-accent">
        <ListChecks size={14} />
        Today&apos;s practice plan
      </h3>
      <div className="space-y-2.5">
        {plan.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground/90">{item.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-2">{item.detail}</p>
            </div>
            <button
              type="button"
              onClick={() => requestNavigate(item.target)}
              className="flex shrink-0 items-center gap-1 rounded-full bg-bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-accent whitespace-nowrap"
            >
              {item.targetLabel}
              <ArrowRight size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
