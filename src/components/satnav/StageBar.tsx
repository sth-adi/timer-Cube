"use client";

import type { NavStage, NavStep } from "@/lib/satnav/planner";
import { cn } from "@/lib/utils/cn";

const STAGES: { id: NavStage[]; label: string }[] = [
  { id: ["cross"], label: "Cross" },
  { id: ["f2l"], label: "F2L" },
  { id: ["oll"], label: "OLL" },
  { id: ["pll", "auf"], label: "PLL" },
];

export function StageBar({ step }: { step: NavStep | null }) {
  const current = step ? STAGES.findIndex((s) => s.id.includes(step.stage)) : -1;
  const solved = step?.stage === "solved";
  return (
    <div className="grid w-full grid-cols-4 gap-1.5">
      {STAGES.map((s, i) => {
        const done = solved || (current >= 0 && i < current);
        const active = i === current;
        return (
          <div key={s.label} className="flex flex-col items-center gap-1">
            <div className={cn("h-1.5 w-full rounded-full", done ? "bg-success" : active ? "bg-accent" : "bg-bg-panel-2")}>
              {active && s.label === "F2L" && step && (
                <div className="h-full rounded-full bg-success" style={{ width: `${(step.pairsDone / 4) * 100}%` }} />
              )}
            </div>
            <span className={cn("text-[10px] font-medium", active ? "text-accent" : done ? "text-success" : "text-muted-2")}>
              {s.label}
              {s.label === "F2L" && step && active ? ` ${step.pairsDone}/4` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
