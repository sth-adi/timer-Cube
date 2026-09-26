"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useProgression } from "@/components/quests/useProgression";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeAchievements } from "@/lib/stats/stats";
import { cn } from "@/lib/utils/cn";

export function AchievementsPanel() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const achievements = useMemo(() => computeAchievements(allSolves), [allSolves]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const { level, xp } = useProgression(false);

  return (
    <div>
      <Link href="/quests" className="mb-3 flex items-center gap-3 rounded-xl bg-bg-panel-2 px-3 py-2 hover:bg-bg-panel-2/70">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-accent-fg">{level.level}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex justify-between text-xs">
            <span className="font-semibold text-foreground">{level.title}</span>
            <span className="tabular-nums text-muted-2">{xp.total.toLocaleString()} XP</span>
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-bg-panel">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(level.into / Math.max(1, level.span)) * 100}%` }} />
          </span>
        </span>
        <span className="flex items-center text-[11px] font-medium text-accent">
          Quests <ChevronRight size={12} />
        </span>
      </Link>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">Milestones</p>
        <span className="text-muted-2 text-xs tabular-timer">
          {unlockedCount} / {achievements.length}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {achievements.map((a) => {
          const pct =
            a.direction === "max"
              ? Math.min(1, a.target > 0 ? a.currentValue / a.target : 0)
              : Number.isFinite(a.currentValue)
                ? Math.min(1, a.target / Math.max(a.currentValue, 1))
                : 0;
          return (
            <div
              key={a.id}
              title={`${a.label} — ${a.description}`}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg p-2 text-center transition-opacity",
                a.unlocked ? "bg-accent-soft" : "bg-bg-panel-2 opacity-50",
              )}
            >
              <span className="text-xl leading-none">{a.icon}</span>
              <span className="text-[10px] leading-tight text-muted line-clamp-2">{a.label}</span>
              {!a.unlocked && a.formatCurrent && a.formatCurrent(0) !== "" && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct * 100}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
