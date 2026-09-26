"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, X } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { getSessionSolves } from "@/lib/db/solves";
import { computeSessionStats, normalSolves, type SessionStats } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

const ROWS: { key: keyof SessionStats; label: string; lowerIsBetter: boolean }[] = [
  { key: "ao5", label: "ao5", lowerIsBetter: true },
  { key: "ao12", label: "ao12", lowerIsBetter: true },
  { key: "ao100", label: "ao100", lowerIsBetter: true },
  { key: "best", label: "Best", lowerIsBetter: true },
  { key: "mean", label: "Mean", lowerIsBetter: true },
  { key: "worst", label: "Worst", lowerIsBetter: true },
  { key: "count", label: "Solves", lowerIsBetter: false },
];

function fmtStat(key: keyof SessionStats, value: number | null): string {
  if (value === null) return "—";
  return key === "count" ? String(value) : formatTime(value);
}

/** Picker for one side of the comparison — a plain select is the least fussy control for "choose one of N sessions" on mobile. */
function SessionPicker({
  sessions,
  value,
  onChange,
}: {
  sessions: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg bg-bg-panel-2 px-2.5 py-2 text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-accent"
    >
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Compares two sessions' stats side by side — "am I actually faster now
 * than I was last month" is a question the single active-session StatsPanel
 * can't answer, since it only ever shows one session at a time.
 */
export function SessionCompareSheet({ onClose }: { onClose: () => void }) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const [leftId, setLeftId] = useState(
    () => activeSessionId ?? sessions[0]?.id ?? "",
  );
  const [rightId, setRightId] = useState(
    () => sessions.find((s) => s.id !== activeSessionId)?.id ?? sessions[0]?.id ?? "",
  );
  const [leftStats, setLeftStats] = useState<SessionStats | null>(null);
  const [rightStats, setRightStats] = useState<SessionStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!leftId) return;
    void getSessionSolves(leftId).then((solves) => {
      if (!cancelled) setLeftStats(computeSessionStats(normalSolves(solves)));
    });
    return () => {
      cancelled = true;
    };
  }, [leftId]);

  useEffect(() => {
    let cancelled = false;
    if (!rightId) return;
    void getSessionSolves(rightId).then((solves) => {
      if (!cancelled) setRightStats(computeSessionStats(normalSolves(solves)));
    });
    return () => {
      cancelled = true;
    };
  }, [rightId]);

  const leftName = useMemo(() => sessions.find((s) => s.id === leftId)?.name ?? "", [sessions, leftId]);
  const rightName = useMemo(() => sessions.find((s) => s.id === rightId)?.name ?? "", [sessions, rightId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cn(
          "glass-panel w-full rounded-t-2xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-sheet-in max-h-[88vh] overflow-y-auto",
          "sm:max-w-md sm:rounded-2xl sm:pb-5 sm:animate-fade-in-up",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <ArrowLeftRight size={16} className="text-accent" />
            Compare sessions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-2 text-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <SessionPicker sessions={sessions} value={leftId} onChange={setLeftId} />
          <SessionPicker sessions={sessions} value={rightId} onChange={setRightId} />
        </div>

        {leftId === rightId ? (
          <p className="py-6 text-center text-xs text-muted">Pick two different sessions to compare.</p>
        ) : !leftStats || !rightStats ? (
          <p className="py-6 text-center text-xs text-muted">Loading…</p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 pb-1 text-[10px] uppercase tracking-wide text-muted-2">
              <span className="truncate text-left">{leftName}</span>
              <span />
              <span className="truncate text-right">{rightName}</span>
            </div>
            {ROWS.map((row) => {
              const l = leftStats[row.key] as number | null;
              const r = rightStats[row.key] as number | null;
              const rightBetter = l !== null && r !== null && l !== r && (row.lowerIsBetter ? r < l : r > l);
              const leftBetter = l !== null && r !== null && l !== r && (row.lowerIsBetter ? l < r : l > r);
              return (
                <div key={row.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 py-1.5 text-sm">
                  <span
                    className={cn("tabular-timer text-left font-medium", leftBetter ? "text-success" : "text-foreground/90")}
                  >
                    {fmtStat(row.key, l)}
                  </span>
                  <span className="text-[11px] text-muted-2">{row.label}</span>
                  <span
                    className={cn("tabular-timer text-right font-medium", rightBetter ? "text-success" : "text-foreground/90")}
                  >
                    {fmtStat(row.key, r)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <Link href="/experiments" className="mt-3 block text-center text-[11px] font-medium text-accent">
          Testing a specific change? Run it as an Experiment — with a real significance test →
        </Link>
      </div>
    </div>
  );
}
