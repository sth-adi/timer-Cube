"use client";

import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import type { Finding, Severity } from "@/lib/analysis/analyze";
import { cn } from "@/lib/utils/cn";

const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; className: string; label: string }> = {
  high: { icon: AlertTriangle, className: "text-danger", label: "Biggest loss" },
  medium: { icon: Lightbulb, className: "text-warning", label: "Worth fixing" },
  low: { icon: Info, className: "text-muted", label: "Note" },
  good: { icon: CheckCircle2, className: "text-success", label: "Well done" },
};

/** The "What to work on" findings list — shared by the analyzer and the public solve-share page, both driven by the same `Finding[]` from analyzeSolve. */
export function FindingsList({ findings }: { findings: Finding[] }) {
  return (
    <div className="card animate-fade-in-up rounded-xl p-3">
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-2">What to work on</h3>
      <div className="space-y-2.5">
        {findings.map((f) => {
          const style = SEVERITY_STYLE[f.severity];
          const Icon = style.icon;
          return (
            <div key={f.id} className="flex gap-2">
              <Icon size={14} className={cn("mt-0.5 shrink-0", style.className)} />
              <div className="min-w-0">
                <p className="text-xs font-medium leading-snug">{f.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{f.detail}</p>
              </div>
            </div>
          );
        })}
        {findings.length === 0 && <p className="text-xs text-muted">Nothing stands out — this was a clean solve.</p>}
      </div>
    </div>
  );
}
