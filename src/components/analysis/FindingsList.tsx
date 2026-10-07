"use client";

import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import type { Finding, Severity } from "@/lib/analysis/analyze";
import "@/styles/recap.css";
import { cn } from "@/lib/utils/cn";
import { CardTitle } from "@/components/recap/RecapParts";

const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; className: string; label: string }> = {
  high: { icon: AlertTriangle, className: "rc-t-bad", label: "Biggest loss" },
  medium: { icon: Lightbulb, className: "rc-t-slow", label: "Worth fixing" },
  low: { icon: Info, className: "text-muted", label: "Note" },
  good: { icon: CheckCircle2, className: "rc-t-good", label: "Well done" },
};

/** The "What to work on" findings list — shared by the analyzer and the public solve-share page, both driven by the same `Finding[]` from analyzeSolve. */
export function FindingsList({ findings }: { findings: Finding[] }) {
  return (
    <div className="card animate-fade-in-up rounded-2xl p-3 sm:p-4">
      <CardTitle as="h3">What to work on</CardTitle>
      <ul className="mt-4 flex flex-col gap-4">
        {findings.map((f) => {
          const style = SEVERITY_STYLE[f.severity];
          const Icon = style.icon;
          return (
            <li key={f.id} className="flex gap-3">
              <Icon size={16} aria-hidden="true" className={cn("mt-0.5 shrink-0", style.className)} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-5 text-foreground">
                  <span className="sr-only">{style.label}: </span>
                  {f.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted">{f.detail}</p>
              </div>
            </li>
          );
        })}
        {findings.length === 0 && <li className="text-[12px] leading-5 text-muted">Nothing stands out, this was a clean solve.</li>}
      </ul>
    </div>
  );
}
