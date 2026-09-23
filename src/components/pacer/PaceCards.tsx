"use client";

import Link from "next/link";
import { ChevronRight, Gauge } from "lucide-react";
import { MILESTONES, paceLadder, paceVerdict, type PaceVerdict } from "@/lib/pacer/pacer";
import type { PaceCall } from "@/hooks/useSplitPacer";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const VERDICT_STYLE: Record<PaceVerdict, string> = {
  ahead: "bg-success/15 text-success",
  on: "bg-accent-soft text-accent",
  behind: "bg-danger/15 text-danger",
};

const signed = (ms: number) => `${ms < 0 ? "−" : "+"}${(Math.abs(ms) / 1000).toFixed(2)}`;

/** During a solve: the last pace call, or what the next split needs to be. */
export function PaceChip({ calls, targets }: { calls: readonly PaceCall[]; targets: readonly number[] }) {
  const last = calls[calls.length - 1];
  if (!last) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-3 py-1 text-[11px] text-muted">
        <Gauge size={12} className="text-accent" /> Cross by {formatTime(targets[0])}
      </span>
    );
  }
  const v = paceVerdict(last.deltaMs);
  return (
    <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tabular-nums", VERDICT_STYLE[v])}>
      <Gauge size={12} /> {MILESTONES[last.index]} {signed(last.deltaMs)} {v === "ahead" ? "ahead" : v === "behind" ? "behind" : "on pace"}
    </span>
  );
}

/** After a solve: every milestone against its target split, and where the time went. */
export function PaceLadderCard({ actual, targets, targetMs }: { actual: readonly (number | null)[]; targets: readonly number[]; targetMs: number }) {
  const ladder = paceLadder(actual, targets);
  const maxAbs = Math.max(300, ...ladder.rows.map((r) => Math.abs(r.segmentDeltaMs ?? 0)));
  return (
    <Link href="/pacer" className="card flex w-full flex-col gap-2.5 rounded-xl p-3 transition-colors hover:bg-bg-panel-2/40">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Gauge size={13} className="text-accent" /> Split Pacer
        <span className="font-normal text-muted-2">· target {formatTime(targetMs)}</span>
        <ChevronRight size={14} className="ml-auto text-muted-2" />
      </p>
      <div className="flex flex-col gap-1">
        {ladder.rows.map((r) => (
          <div key={r.milestone} className="flex items-center gap-2 text-[11px]">
            <span className="w-12 shrink-0 text-muted">{r.milestone}</span>
            {/* The bar is how much this stretch gained (left, green) or lost (right, red) against its target. */}
            <div className="relative h-2 flex-1 rounded-full bg-bg-panel-2">
              <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-border-strong" />
              {r.segmentDeltaMs !== null && (
                <span
                  className={cn("absolute top-0 h-full rounded-full", r.segmentDeltaMs > 0 ? "left-1/2 bg-danger/70" : "right-1/2 bg-success/70")}
                  style={{ width: `${(Math.abs(r.segmentDeltaMs) / maxAbs) * 50}%` }}
                />
              )}
            </div>
            <span
              className={cn(
                "w-14 shrink-0 text-right font-semibold tabular-nums",
                r.deltaMs === null ? "text-muted-2" : paceVerdict(r.deltaMs) === "behind" ? "text-danger" : paceVerdict(r.deltaMs) === "ahead" ? "text-success" : "text-accent",
              )}
            >
              {r.deltaMs === null ? "—" : signed(r.deltaMs)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        {ladder.worst
          ? `Lost the most on the way to ${ladder.worst.milestone.toLowerCase()} (${signed(ladder.worst.segmentDeltaMs!)}s against the split).`
          : "Every stretch was at or under its split."}
        {ladder.best ? ` Gained most on ${ladder.best.milestone.toLowerCase()} (${signed(ladder.best.segmentDeltaMs!)}s).` : ""}
      </p>
    </Link>
  );
}
