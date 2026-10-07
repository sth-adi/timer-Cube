"use client";

import { Scale } from "lucide-react";
import type { TimeReport } from "@/lib/analysis/timeWonLost";
import { cn } from "@/lib/utils/cn";
import { CardTitle, Delta, RecapCard, secs2 } from "./RecapParts";

/** Differences inside this window read as "about the same" — no colour, a flat marker. */
const SAME_MS = 150;

/**
 * Every step against your usual for it (bar: left of the centre line = faster, right = slower;
 * faster is solid, slower is striped, and the number carries a sign and an arrow, so none of it
 * leans on red versus green) and against the same step of your fastest solve.
 */
export function TimeWonLostCard({ report }: { report: TimeReport }) {
  if (!report.headline) return null;
  const max = Math.max(300, ...report.steps.map((s) => Math.abs(s.vsUsual ?? 0)));
  const hasPb = report.steps.some((s) => s.vsPb !== null);
  // One grid for the header and every row, so the columns line up exactly.
  const cols = hasPb ? "grid-cols-[3.5rem_minmax(0,1fr)_3.75rem_3.75rem]" : "grid-cols-[3.5rem_minmax(0,1fr)_3.75rem]";
  return (
    <RecapCard>
      <CardTitle icon={<Scale size={12} aria-hidden="true" />}>Where the time went</CardTitle>
      <p className="mt-2 text-[13px] font-semibold leading-5 text-foreground">{report.headline}</p>
      <div className="mt-4 flex flex-col gap-2">
        <div className={cn("grid items-center gap-x-2 whitespace-nowrap text-[10px] font-medium leading-4 text-muted-2", cols)}>
          <span />
          <span className="flex min-w-0 justify-between gap-1">
            <span>&larr; faster</span>
            <span>slower &rarr;</span>
          </span>
          <span className="text-right">vs usual</span>
          {hasPb && <span className="text-right">vs best</span>}
        </div>
        {report.steps.map((s) => {
          const d = s.vsUsual;
          const width = d === null ? 0 : (Math.abs(d) / max) * 50;
          const dir = d === null || Math.abs(d) < SAME_MS ? "flat" : d > 0 ? "slow" : "fast";
          return (
            <div key={s.label} className={cn("grid min-h-6 items-center gap-x-2 text-[12px] leading-4", cols)}>
              <span className="truncate text-muted">{s.label}</span>
              <span className="rc-diverge" aria-hidden="true">
                {d !== null && Math.abs(d) >= 50 && <span className="rc-diverge-bar" data-dir={d > 0 ? "slow" : "fast"} style={{ width: `${width}%` }} />}
              </span>
              {d === null ? <span className="text-right text-muted-2">—</span> : <Delta ms={d} dir={dir} />}
              {hasPb && (s.vsPb === null ? <span className="text-right text-muted-2">—</span> : <Delta ms={s.vsPb} dir="flat" unit="your best" className="opacity-90" />)}
            </div>
          );
        })}
      </div>
      {report.pbTotalMs !== null && <p className="rc-note mt-3">&ldquo;vs best&rdquo; is the same step in your fastest smart-cube solve ({secs2(report.pbTotalMs)}s).</p>}
    </RecapCard>
  );
}
