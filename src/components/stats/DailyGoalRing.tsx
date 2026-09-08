"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";

const SIZE = 72;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function DailyGoalRing() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);

  const todayCount = useMemo(() => {
    const key = todayKey();
    return allSolves.filter((s) => {
      const d = new Date(s.date);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key;
    }).length;
  }, [allSolves]);

  const pct = Math.min(1, dailyGoal > 0 ? todayCount / dailyGoal : 0);
  const dashoffset = CIRCUMFERENCE * (1 - pct);
  const done = todayCount >= dailyGoal;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--bg-panel-2)" strokeWidth={STROKE} />
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
            style={{ transition: "stroke-dashoffset 0.4s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular-timer text-base font-semibold leading-none">{todayCount}</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">{done ? "Goal reached! 🎉" : "Today's practice"}</p>
        <p className="text-muted-2 text-xs">
          {todayCount} / {dailyGoal} solves
        </p>
      </div>
    </div>
  );
}
