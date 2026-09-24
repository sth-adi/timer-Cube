"use client";

import { useMemo } from "react";
import { Shuffle } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { MIN_PER_GROUP, buildEventMix } from "@/lib/analysis/eventMix";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/**
 * Event Mix: every puzzle and practice category you do, ranked against the
 * one baseline everyone has — ordinary two-handed 3x3.
 */
export default function EventMixPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  const r = useMemo(() => buildEventMix(allSolves, sessions), [allSolves, sessions]);

  return (
    <AnalyticsShell
      icon={<Shuffle size={17} className="text-accent" />}
      title="Event Mix"
      subtitle="Every puzzle and category you do, ranked against your ordinary 3x3."
    >
      {!r ? (
        <div className="card flex flex-col gap-1 rounded-xl p-6 text-center">
          <p className="text-sm text-muted">Event Mix needs at least {MIN_PER_GROUP} completed solves of ordinary two-handed 3x3, plus {MIN_PER_GROUP} more of something else to compare against.</p>
          <p className="text-[11px] text-muted-2">Every session&apos;s puzzle, and every solve&apos;s practice tag, counts toward this.</p>
        </div>
      ) : (
        <>
          <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
            <p className="text-5xl font-bold text-foreground">{secs(r.baseline.avgMs)}</p>
            <p className="text-xs font-medium text-muted">ordinary 3x3 average</p>
            <p className="max-w-sm text-[11px] text-muted-2">over {r.baseline.count} solves — your baseline</p>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-foreground">{r.headline}</p>

          <div className="card flex flex-col gap-3 rounded-xl p-4">
            <SectionTitle>Everything else, ranked against it</SectionTitle>
            {(() => {
              const max = Math.max(...r.others.map((o) => o.ratio), 1);
              return r.others.map((o) => (
                <div key={o.key} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate text-foreground/90">{o.label}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
                    <div className="absolute inset-y-0 left-0 rounded bg-accent/60" style={{ width: `${(o.ratio / max) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-muted-2">
                    {o.ratio.toFixed(2)}x · {secs(o.avgMs)}
                  </span>
                </div>
              ));
            })()}
            <p className="text-[10px] text-muted-2">1.00x means exactly your ordinary 3x3 pace. Each group needs at least {MIN_PER_GROUP} completed solves to show up.</p>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
