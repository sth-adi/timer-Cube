"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Grade, InspectionReport } from "@/lib/inspection/report";
import { cn } from "@/lib/utils/cn";

export const GRADE_STYLE: Record<Grade, string> = {
  A: "text-success",
  B: "text-accent",
  C: "text-warning",
  D: "text-danger",
  F: "text-danger",
};

export function GradeBadge({ grade, size = "md" }: { grade: Grade; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-bold tabular-nums",
        size === "lg" ? "h-16 w-16 text-4xl" : "h-10 w-10 text-xl",
        GRADE_STYLE[grade],
      )}
    >
      {grade}
    </span>
  );
}

/** Planned-vs-used cross turns as a segmented bar: solid = planned, hatched = found after a pause. */
export function PlannedBar({ report }: { report: InspectionReport }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: Math.max(1, report.crossTurns) }, (_, i) => (
        <span
          key={i}
          className={cn("h-2 flex-1 rounded-sm", i < report.plannedTurns ? "bg-success" : "bg-warning/60")}
          title={i < report.plannedTurns ? "planned in inspection" : "found after a pause"}
        />
      ))}
    </div>
  );
}

/** Post-solve: how good the inspection was, read off the cross you just did. */
export function InspectionGradeCard({ report }: { report: InspectionReport }) {
  return (
    <Link href="/inspection" className="card flex w-full items-center gap-3 rounded-xl p-3 transition-colors hover:bg-bg-panel-2/40">
      <GradeBadge grade={report.grade} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          Inspection
          <span className="font-normal text-muted-2">
            · planned {report.plannedTurns}/{report.crossTurns} cross turns{report.xcross ? " · x-cross" : ""}
          </span>
        </p>
        <PlannedBar report={report} />
        <p className="truncate text-[11px] text-muted">{report.notes[0]}</p>
      </div>
      <ChevronRight size={14} className="shrink-0 text-muted-2" />
    </Link>
  );
}
