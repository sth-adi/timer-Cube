"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Swords } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeSessionStats } from "@/lib/stats/stats";
import { fetchPublicStatsByUsername, type PublicStats } from "@/lib/social/rival";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

function Row({ label, you, rival }: { label: string; you: number | null; rival: number | null }) {
  const youWins = you !== null && (rival === null || you < rival);
  const rivalWins = rival !== null && (you === null || rival < you);
  return (
    <div className="grid grid-cols-3 items-center gap-1 py-1 text-xs">
      <span className={cn("tabular-timer text-right", youWins && "font-semibold text-success")}>
        {you !== null ? formatTime(you) : "—"}
      </span>
      <span className="text-center text-[10px] uppercase tracking-wide text-muted-2">{label}</span>
      <span className={cn("tabular-timer text-left", rivalWins && "font-semibold text-success")}>
        {rival !== null ? formatTime(rival) : "—"}
      </span>
    </div>
  );
}

/**
 * Head-to-head against any other synced account, by username — reads
 * lib/social/rival.ts's public_stats lookup (the only cross-user data this
 * app ever exposes: a handful of best times + a solve count, nothing about
 * what was actually solved or when). Nothing here is a persistent
 * "friends" relationship, just a one-off comparison you can pull up
 * whenever.
 */
export function RivalCompare() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const yours = useMemo(() => computeSessionStats(allSolves), [allSolves]);

  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublicStats | null>(null);
  const [notFound, setNotFound] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || busy) return;
    setBusy(true);
    setNotFound(false);
    const stats = await fetchPublicStatsByUsername(username.trim());
    setBusy(false);
    setResult(stats);
    setNotFound(!stats);
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-2">
        <Swords size={12} /> Rival
      </p>
      <form onSubmit={onSubmit} className="flex gap-1.5">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Their username"
          className="min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!username.trim() || busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-medium text-foreground/90 hover:brightness-110 disabled:opacity-40"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Compare
        </button>
      </form>

      {notFound && <p className="mt-1.5 text-[11px] text-danger">No account with that username (or they haven&apos;t synced yet).</p>}

      {result && (
        <div className="mt-2 rounded-lg bg-bg-panel-2 p-2.5">
          <div className="grid grid-cols-3 items-center gap-1 pb-1">
            <span className="truncate text-right text-[11px] font-medium text-foreground/90">You</span>
            <span />
            <span className="truncate text-left text-[11px] font-medium text-foreground/90">{result.username}</span>
          </div>
          <Row label="Single" you={yours.best} rival={result.bestSingleMs} />
          <Row label="ao5" you={yours.bestAo5} rival={result.bestAo5Ms} />
          <Row label="ao12" you={yours.bestAo12} rival={result.bestAo12Ms} />
          <div className="grid grid-cols-3 items-center gap-1 pt-1 text-xs">
            <span className="tabular-nums text-right">{yours.count}</span>
            <span className="text-center text-[10px] uppercase tracking-wide text-muted-2">Solves</span>
            <span className="tabular-nums text-left">{result.totalSolves}</span>
          </div>
        </div>
      )}
    </div>
  );
}
