"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, HeartPulse, Sparkles, ThermometerSnowflake, Trophy, TrendingDown, Waves } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { bestAverageOfN, normalSolves } from "@/lib/stats/stats";
import { currentLevelMs } from "@/lib/journey/journey";
import { currentSitting, liveCoach, type CardKind, type CoachCard } from "@/lib/live/sessionCoach";
import { cn } from "@/lib/utils/cn";

const wallNow = () => Date.now();

const ICON: Record<CardKind, typeof Flame> = {
  warmup: ThermometerSnowflake,
  bounce: Waves,
  tilt: HeartPulse,
  hot: Flame,
  fading: TrendingDown,
  pb: Trophy,
  steady: Sparkles,
};
const TONE: Record<CoachCard["tone"], string> = { good: "text-success", warn: "text-warning", info: "text-accent" };

/**
 * Live Session Coach: one line between solves, read from the sitting
 * you're in against how your sittings usually go — warm-up, tilt, a hot
 * run, fading, a PB average in reach. Shown only between solves.
 */
export function LiveSessionCoach() {
  const enabled = useSettingsStore((s) => s.liveCoachEnabled);
  const solves = useSessionStore((s) => s.solves);
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const [open, setOpen] = useState(false);
  // Re-read the clock every minute so a long break starts a new sitting.
  const [now, setNow] = useState(wallNow);
  useEffect(() => {
    const id = window.setInterval(() => setNow(wallNow()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const latest = solves.reduce((m, s) => Math.max(m, s.date), 0);
  const clock = Math.max(now, latest);

  const is333 = sessions.find((s) => s.id === activeSessionId)?.event === "333";
  const coach = useMemo(() => {
    if (!is333) return null;
    const mine = normalSolves(solves);
    const sitting = currentSitting(mine, clock);
    const ids333 = new Set(sessions.filter((s) => s.event === "333").map((s) => s.id));
    const inSitting = new Set(sitting.map((s) => s.id));
    const history = allSolves.filter((s) => ids333.has(s.sessionId) && !inSitting.has(s.id));
    return liveCoach(history, sitting, {
      typicalMs: currentLevelMs(history.filter((s) => !s.event)),
      bestAo5Ms: bestAverageOfN(mine, 5),
    });
  }, [is333, solves, allSolves, sessions, clock]);

  if (!enabled || !coach) return null;
  const [top, ...rest] = coach.cards;
  const Icon = ICON[top.kind];

  return (
    <div className="card flex w-full max-w-sm flex-col gap-1.5 rounded-xl px-3 py-2.5" aria-live="polite">
      <div className="flex items-start gap-2.5">
        <Icon size={16} className={cn("mt-0.5 shrink-0", TONE[top.tone])} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center justify-between gap-2 text-[12px] font-semibold text-foreground">
            {top.title}
            <span className="shrink-0 text-[10px] font-normal tabular-nums text-muted-2">
              solve {coach.n + 1}
              {coach.vsTypical !== null && ` · ${coach.vsTypical >= 0 ? "+" : "−"}${Math.abs(Math.round(coach.vsTypical * 100))}% today`}
            </span>
          </p>
          <p className="text-[11px] leading-snug text-muted">{top.line}</p>
        </div>
      </div>
      {rest.length > 0 && (
        <>
          {open &&
            rest.map((c) => {
              const I = ICON[c.kind];
              return (
                <div key={c.kind} className="flex items-start gap-2.5 border-t border-border pt-1.5">
                  <I size={14} className={cn("mt-0.5 shrink-0", TONE[c.tone])} />
                  <p className="text-[11px] leading-snug text-muted">
                    <span className="font-semibold text-foreground">{c.title}.</span> {c.line}
                  </p>
                </div>
              );
            })}
          <button type="button" onClick={() => setOpen((v) => !v)} className="self-end text-[10px] font-medium text-muted-2 hover:text-foreground">
            {open ? "less" : `+${rest.length} more`}
          </button>
        </>
      )}
    </div>
  );
}
