"use client";

import { useEffect, useMemo } from "react";
import { Flame } from "lucide-react";
import { useTimer } from "@/hooks/useTimer";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { DAILY_CHALLENGE_LENGTH, useDailyChallengeStore } from "@/lib/store/dailyChallengeStore";
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

  const { phase, displayMs, press, release } = useTimer({
    inspectionEnabled: false,
    holdToStartMs,
    onComplete: (ms) => recordTime(ms),
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if (e.code === "Space" && !e.repeat && !inField && !done) {
        e.preventDefault();
        press();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [press, release, done]);

  const ao5 = useMemo(() => {
    if (times.some((t) => t === null)) return null;
    return averageOfN(times as number[]).value;
  }, [times]);

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
      </div>
    );
  }

  return (
    <div
      className="flex w-full max-w-md flex-1 flex-col items-center gap-3 py-2 select-none touch-none"
      onTouchStart={(e) => {
        e.preventDefault();
        press();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        release();
      }}
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
