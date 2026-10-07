"use client";

import { useState } from "react";
import { Radar, ShieldCheck } from "lucide-react";
import type { Mistake, MistakeHabit, MistakeKind, MistakeReport } from "@/lib/analysis/mistakeRadar";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { markerSpan } from "./radarMarkers";

export const KIND_COLOR: Record<MistakeKind, string> = {
  "pair-knocked": "#ff6b6b",
  "cross-broken": "#ff9f43",
  "extra-oll-look": "#feca57",
  "extra-pll-look": "#48dbfb",
  "wasted-turns": "#a29bfe",
};

function ScoreRing({ score }: { score: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const color = score >= 95 ? "var(--success)" : score >= 80 ? "var(--warning)" : "var(--danger)";
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" className="shrink-0">
      <circle cx={22} cy={22} r={r} fill="none" stroke="var(--bg-panel-2)" strokeWidth={4} />
      <circle
        cx={22}
        cy={22}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 22 22)"
      />
      <text x={22} y={26} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--foreground)">
        {score}
      </text>
    </svg>
  );
}

/**
 * Post-solve Mistake Radar: every blunder the replay found, pinned on a
 * timeline of the solve and priced in time. The headline number is the
 * solve you'd have had without them — the most motivating framing of
 * "what went wrong" there is.
 */
export function MistakeRadarCard({
  report,
  totalMs,
  habits,
  className,
}: {
  report: MistakeReport;
  totalMs: number;
  /** This mistake kind's track record across your other solves — so a flagged mistake reads as "you do this" or "one-off", not just this once. */
  habits?: readonly MistakeHabit[];
  className?: string;
}) {
  const { mistakes } = report;
  // The mistake a tap on the timeline picked (a touch screen has no hover): its reason is spelled out under the track and its row below is marked. Until one is picked, the first is read out.
  const [picked, setPicked] = useState<Mistake | null>(null);
  const pickedNow = picked && mistakes.includes(picked) ? picked : null;
  const shown = pickedNow ?? mistakes[0];
  const habitFor = (kind: MistakeKind) => habits?.find((h) => h.kind === kind && h.solvesAffected >= 3);
  return (
    <div className={cn("card flex w-full flex-col gap-3 rounded-xl p-3", className)}>
      <div className="flex items-center gap-3">
        <ScoreRing score={report.cleanScore} />
        <div className="flex min-w-0 flex-col">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Radar size={13} className="text-accent" /> Mistake Radar
          </p>
          {mistakes.length === 0 ? (
            <p className="text-[11px] text-muted">Clean solve, nothing knocked out, no extra looks, no wasted turns.</p>
          ) : (
            <p className="text-[11px] text-muted">
              {mistakes.length} mistake{mistakes.length === 1 ? "" : "s"} cost ~{formatTime(report.totalCostMs)}, this was a{" "}
              <span className="font-semibold text-success">{formatTime(report.potentialMs)}</span> solve without them.
            </p>
          )}
        </div>
      </div>

      {mistakes.length > 0 && (
        <>
          <div className="relative h-3 w-full rounded-full bg-bg-panel-2" role="group" aria-label="Where the mistakes happened in the solve">
            {mistakes.map((m, i) => {
              const { left, width } = markerSpan(m.atMs, m.costMs, totalMs);
              return (
                <button
                  key={i}
                  type="button"
                  title={m.title}
                  aria-label={`${m.title}, at ${formatTime(m.atMs)}`}
                  aria-pressed={pickedNow === m}
                  onClick={() => setPicked(pickedNow === m ? null : m)}
                  className={cn(
                    "absolute top-0 h-3 rounded-full after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                    pickedNow === m ? "opacity-100 ring-1 ring-foreground/70" : "opacity-90",
                  )}
                  style={{ left: `${left}%`, width: `${width}%`, background: KIND_COLOR[m.kind] }}
                />
              );
            })}
          </div>
          <p className="h-4 truncate text-[11px] text-muted" aria-live="polite">
            <span className="font-semibold text-foreground">{shown.title}</span> · {shown.phase} · {formatTime(shown.atMs)}
            {mistakes.length > 1 && !pickedNow && <span className="text-muted-2"> · tap a marker for the others</span>}
          </p>

          <ul className="flex flex-col gap-1.5">
            {mistakes.map((m, i) => {
              const habit = habitFor(m.kind);
              return (
                <li key={i} className={cn("flex items-start gap-2 rounded-lg bg-bg-panel-2 px-2.5 py-2", pickedNow === m && "ring-1 ring-foreground/30")}>
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[m.kind] }} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-[11px] font-semibold text-foreground">
                      {m.title} <span className="font-normal text-muted-2">· {m.phase} · {formatTime(m.atMs)}</span>
                    </p>
                    <p className="text-[11px] text-muted">{m.detail}</p>
                    {habit && (
                      <p className="mt-0.5 text-[10px] text-warning">
                        A habit, {habit.solvesAffected} of your recent solves had this, ~{formatTime(habit.costPerSolveMs)} a solve on average.
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-danger">−{(m.costMs / 1000).toFixed(2)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {mistakes.length === 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-success">
          <ShieldCheck size={12} /> Nothing to fix here.
        </p>
      )}
    </div>
  );
}
