"use client";

import { Scale } from "lucide-react";
import type { TimeReport } from "@/lib/analysis/timeWonLost";
import { cn } from "@/lib/utils/cn";

const signed = (ms: number) => `${ms > 0 ? "+" : ms < 0 ? "−" : ""}${(Math.abs(ms) / 1000).toFixed(2)}`;

/**
 * Every step against your usual for it (bar: left = faster, right = slower)
 * and against the same step of your fastest solve.
 */
export function TimeWonLostCard({ report }: { report: TimeReport }) {
  if (!report.headline) return null;
  const max = Math.max(300, ...report.steps.map((s) => Math.abs(s.vsUsual ?? 0)));
  const hasPb = report.steps.some((s) => s.vsPb !== null);
  return (
    <div className="w-full rounded-xl bg-bg-panel-2 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-2">
        <Scale size={11} className="text-accent" /> Where the time went
      </p>
      <p className="mb-2.5 text-[12px] font-semibold leading-snug text-foreground">{report.headline}</p>
      <div className="flex flex-col gap-1.5">
        <div className={cn("grid items-center gap-2 text-[9px] uppercase tracking-wide text-muted-2", hasPb ? "grid-cols-[3.5rem_1fr_3rem_3rem]" : "grid-cols-[3.5rem_1fr_3rem]")}>
          <span />
          <span className="flex justify-between">
            <span>faster</span>
            <span>·</span>
            <span>slower</span>
          </span>
          <span className="text-right">vs usual</span>
          {hasPb && <span className="text-right">vs best</span>}
        </div>
        {report.steps.map((s) => {
          const d = s.vsUsual;
          const width = d === null ? 0 : (Math.abs(d) / max) * 50;
          return (
            <div key={s.label} className={cn("grid items-center gap-2 text-[11px]", hasPb ? "grid-cols-[3.5rem_1fr_3rem_3rem]" : "grid-cols-[3.5rem_1fr_3rem]")}>
              <span className="truncate text-muted">{s.label}</span>
              <span className="relative h-2 rounded-full bg-bg-elevated">
                <span className="absolute inset-y-[-2px] left-1/2 w-px bg-border-strong" />
                {d !== null && (
                  <span
                    className={cn("absolute inset-y-0 rounded-full", d > 0 ? "bg-warning" : "bg-success")}
                    style={d > 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
                  />
                )}
              </span>
              <span className={cn("text-right tabular-nums", d === null ? "text-muted-2" : d > 150 ? "text-warning" : d < -150 ? "text-success" : "text-muted")}>{d === null ? "—" : signed(d)}</span>
              {hasPb && <span className="text-right tabular-nums text-muted-2">{s.vsPb === null ? "—" : signed(s.vsPb)}</span>}
            </div>
          );
        })}
      </div>
      {report.pbTotalMs !== null && <p className="mt-2 text-[10px] text-muted-2">&ldquo;vs best&rdquo; is the same step in your fastest smart-cube solve ({(report.pbTotalMs / 1000).toFixed(2)}s).</p>}
    </div>
  );
}
