"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useNow } from "@/hooks/useNow";
import "@/styles/stats-charts.css";

const SIZE = 80;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function todayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function DailyGoalRing() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);
  // Ticks, so the count rolls over to a new day without a reload.
  const now = useNow(60_000);

  const todayCount = useMemo(() => {
    const key = todayKey(now);
    return allSolves.filter((s) => {
      const d = new Date(s.date);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key;
    }).length;
  }, [allSolves, now]);

  const pct = Math.min(1, dailyGoal > 0 ? todayCount / dailyGoal : 0);
  const dashoffset = CIRCUMFERENCE * (1 - pct);
  const done = todayCount >= dailyGoal;

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative shrink-0"
        style={{ width: SIZE, height: SIZE }}
        role="progressbar"
        aria-label="Today's solves toward your daily goal"
        aria-valuemin={0}
        aria-valuemax={dailyGoal}
        aria-valuenow={Math.min(todayCount, dailyGoal)}
        aria-valuetext={`${todayCount} of ${dailyGoal} solves`}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
          {/* the empty track is a quiet wash of ink, so the filled arc is the only loud thing */}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="color-mix(in srgb, var(--foreground) 9%, var(--bg-panel))" strokeWidth={STROKE} />
          {pct > 0 && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={done ? "var(--success)" : "var(--accent)"}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashoffset}
              className="sc-ring"
              style={{ ["--sc-from" as string]: CIRCUMFERENCE, transition: "stroke-dashoffset 0.4s ease-out" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          {done ? (
            <Check size={20} strokeWidth={1.75} className="text-success" aria-hidden />
          ) : (
            <span className="tabular-timer text-lg font-semibold leading-none">{todayCount}</span>
          )}
          <span className="tabular-timer text-[11px] leading-none text-muted-2">/ {dailyGoal}</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold tracking-[-0.01em]">{done ? "Goal reached" : "Today's practice"}</p>
        <p className="tabular-timer mt-0.5 text-xs text-muted-2">
          {todayCount} / {dailyGoal} solves
        </p>
      </div>
    </div>
  );
}
