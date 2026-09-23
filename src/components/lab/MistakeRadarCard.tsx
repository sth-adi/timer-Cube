"use client";

import { Radar, ShieldCheck } from "lucide-react";
import type { MistakeKind, MistakeReport } from "@/lib/analysis/mistakeRadar";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

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
export function MistakeRadarCard({ report, totalMs, className }: { report: MistakeReport; totalMs: number; className?: string }) {
  const { mistakes } = report;
  return (
    <div className={cn("card flex w-full flex-col gap-3 rounded-xl p-3", className)}>
      <div className="flex items-center gap-3">
        <ScoreRing score={report.cleanScore} />
        <div className="flex min-w-0 flex-col">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Radar size={13} className="text-accent" /> Mistake Radar
          </p>
          {mistakes.length === 0 ? (
            <p className="text-[11px] text-muted">Clean solve — nothing knocked out, no extra looks, no wasted turns.</p>
          ) : (
            <p className="text-[11px] text-muted">
              {mistakes.length} mistake{mistakes.length === 1 ? "" : "s"} cost ~{formatTime(report.totalCostMs)} — this was a{" "}
              <span className="font-semibold text-success">{formatTime(report.potentialMs)}</span> solve without them.
            </p>
          )}
        </div>
      </div>

      {mistakes.length > 0 && (
        <>
          <div className="relative h-3 w-full rounded-full bg-bg-panel-2">
            {mistakes.map((m, i) => (
              <span
                key={i}
                title={m.title}
                className="absolute top-0 h-3 rounded-full opacity-90"
                style={{
                  left: `${Math.min(98, (m.atMs / Math.max(1, totalMs)) * 100)}%`,
                  width: `${Math.max(2, (m.costMs / Math.max(1, totalMs)) * 100)}%`,
                  background: KIND_COLOR[m.kind],
                }}
              />
            ))}
          </div>

          <ul className="flex flex-col gap-1.5">
            {mistakes.map((m, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-bg-panel-2 px-2.5 py-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[m.kind] }} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="text-[11px] font-semibold text-foreground">
                    {m.title} <span className="font-normal text-muted-2">· {m.phase} · {formatTime(m.atMs)}</span>
                  </p>
                  <p className="text-[11px] text-muted">{m.detail}</p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-danger">−{(m.costMs / 1000).toFixed(2)}</span>
              </li>
            ))}
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
