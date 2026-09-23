"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Trophy } from "lucide-react";
import { useTimer } from "@/hooks/useTimer";
import { useTimerInput } from "@/hooks/useTimerInput";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useAuthStore } from "@/lib/store/authStore";
import { displayUsername } from "@/lib/auth/username";
import { DAILY_CHALLENGE_LENGTH, useDailyChallengeStore } from "@/lib/store/dailyChallengeStore";
import { todayDateKey } from "@/lib/analysis/dailyChallenge";
import { fetchDailyLeaderboard, submitDailyChallengeResult, type DailyLeaderboard } from "@/lib/social/leaderboard";
import { averageOfN } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

/**
 * A Wordle-style daily ritual: the same 5 scrambles all day (cached, not
 * regenerated on revisit), one attempt, an ao5 at the end, and a streak that
 * only continues if yesterday was completed too — a reason to open the app
 * even on a day you don't feel like a full session.
 */
export function DailyChallengeView() {
  const holdToStartMs = useSettingsStore((s) => s.holdToStartMs);
  const scrambles = useDailyChallengeStore((s) => s.scrambles);
  const times = useDailyChallengeStore((s) => s.times);
  const streak = useDailyChallengeStore((s) => s.streak);
  const loading = useDailyChallengeStore((s) => s.loading);
  const ensureToday = useDailyChallengeStore((s) => s.ensureToday);
  const recordTime = useDailyChallengeStore((s) => s.recordTime);

  useEffect(() => {
    void ensureToday();
  }, [ensureToday]);

  const currentIndex = times.findIndex((t) => t === null);
  const done = scrambles.length === DAILY_CHALLENGE_LENGTH && currentIndex === -1;
  const scramble = currentIndex >= 0 ? scrambles[currentIndex] : "";

  const { phase, displayMs, press, release, cancel } = useTimer({
    inspectionEnabled: false,
    holdToStartMs,
    onComplete: ({ timeMs }) => recordTime(timeMs),
  });

  const touch = useTimerInput({ press, release, cancel, enabled: !done });

  const ao5 = useMemo(() => {
    if (times.some((t) => t === null)) return null;
    return averageOfN(times as number[]).value;
  }, [times]);

  // Once today's ao5 is in, submit it to the shared leaderboard (signed-in
  // only) and pull back the current standings — a ref instead of state for
  // "have we submitted" since it's write-once-per-day bookkeeping that
  // should never itself trigger a re-render.
  const user = useAuthStore((s) => s.user);
  const submittedRef = useRef<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<DailyLeaderboard | null>(null);
  useEffect(() => {
    if (ao5 === null || !user) return;
    const today = todayDateKey();
    if (submittedRef.current === today) return;
    submittedRef.current = today;
    void (async () => {
      await submitDailyChallengeResult(user.id, displayUsername(user), today, ao5);
      setLeaderboard(await fetchDailyLeaderboard(today, user.id));
    })();
  }, [ao5, user]);

  if (loading || scrambles.length < DAILY_CHALLENGE_LENGTH) {
    return (
      <div className="flex w-full max-w-md flex-1 items-center justify-center py-8">
        <p className="text-sm text-muted-2">Preparing today&apos;s challenge…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 py-2 text-center">
        <Flame size={32} className="text-warning" />
        <p className="text-lg font-semibold">Today&apos;s challenge complete</p>
        <p className="tabular-timer text-4xl font-bold">{ao5 !== null ? formatTime(ao5) : "—"}</p>
        <p className="text-xs uppercase tracking-wide text-muted-2">ao5</p>
        <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
          <Flame size={14} /> {streak}-day streak
        </p>
        <div className="flex gap-3 text-xs text-muted">
          {times.map((t, i) => (
            <span key={i} className="tabular-timer">
              {t !== null ? formatTime(t) : "—"}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-2">Come back tomorrow for a fresh set — and to keep the streak alive.</p>

        {leaderboard && leaderboard.top.length > 0 && (
          <div className="mt-3 w-full max-w-xs rounded-xl bg-bg-panel-2 p-3 text-left">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Trophy size={13} className="text-warning" /> Today&apos;s leaderboard
              </p>
              {leaderboard.yourRank && (
                <span className="text-[11px] text-muted-2">
                  You: #{leaderboard.yourRank} of {leaderboard.total}
                </span>
              )}
            </div>
            <ol className="flex flex-col gap-1">
              {leaderboard.top.map((entry, i) => (
                <li
                  key={entry.username}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2 py-1 text-xs",
                    entry.isYou ? "bg-accent-soft text-accent" : "text-foreground/90",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="w-4 shrink-0 text-muted-2">{i + 1}</span>
                    <span className="truncate">{entry.username}</span>
                  </span>
                  <span className="tabular-timer shrink-0">{formatTime(entry.ao5Ms)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {!user && (
          <p className="mt-2 text-[11px] text-muted-2">Sign in (Settings → Account) to join today&apos;s leaderboard.</p>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex w-full max-w-md flex-1 flex-col items-center gap-3 py-2 select-none touch-none"
      {...touch}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Flame size={12} className="text-warning" />
        {streak}-day streak
        <span className="text-muted-2">
          · solve {currentIndex + 1} of {DAILY_CHALLENGE_LENGTH}
        </span>
      </div>

      <p className="tabular-timer max-w-sm text-center text-sm leading-relaxed text-foreground/90 select-text">
        {scramble}
      </p>

      <div className="flex gap-1.5">
        {times.map((t, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-7 rounded-full transition-colors",
              t !== null ? "bg-success" : i === currentIndex ? "bg-accent" : "bg-bg-panel-2",
            )}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p
          className={cn(
            "tabular-timer text-[16vw] leading-none font-bold sm:text-7xl",
            phase === "holding" ? "text-danger" : phase === "ready" ? "text-success" : "text-foreground",
          )}
        >
          {formatTime(displayMs)}
        </p>
        {phase === "idle" && <p className="text-muted-2 text-sm">hold space to start</p>}
      </div>
    </div>
  );
}
