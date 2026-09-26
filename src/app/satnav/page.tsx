"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, GraduationCap, Loader2, Navigation, PartyPopper, RefreshCw, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { SatNavLesson } from "@/components/satnav/SatNavLesson";
import { useSatNavRoute } from "@/components/satnav/useSatNavRoute";
import { StageBar } from "@/components/satnav/StageBar";
import { cn } from "@/lib/utils/cn";

/** In coach mode, the next step only appears after you've been stuck this long. */
const COACH_DELAY_MS = 2500;

/**
 * Solve Sat-Nav: turn-by-turn directions for a real cube. It reads the cube's
 * live state after every turn, plans the next leg of a CFOP solve from
 * exactly there (optimal cross, the easiest pair and its insertion, then
 * the book OLL/PLL with the right AUF), and ticks the turns off as you make
 * them. Go off-route and it recalculates from wherever you ended up — so
 * it works from any state, mid-solve, mid-scramble, anywhere.
 */
function SatNav() {
  const [coach, setCoach] = useState(false);
  const [revealed, setRevealed] = useState(true);
  const coachTimer = useRef<number | null>(null);
  const coachRef = useRef(coach);
  useEffect(() => {
    coachRef.current = coach;
  }, [coach]);

  const armCoach = useCallback(() => {
    if (coachTimer.current) window.clearTimeout(coachTimer.current);
    if (!coachRef.current) return;
    setRevealed(false);
    coachTimer.current = window.setTimeout(() => setRevealed(true), COACH_DELAY_MS);
  }, []);

  const { nav, reroutes, replan } = useSatNavRoute({ onMove: armCoach, onStep: armCoach });

  useEffect(() => () => void (coachTimer.current && window.clearTimeout(coachTimer.current)), []);

  const { step, status } = nav;
  const hidden = coach && !revealed && step?.stage !== "solved";

  return (
    <div className="flex flex-col items-center gap-4">
      <StageBar step={step} />
      <GyroTwin size={88} showControls={false} />

      <div className="card flex w-full flex-col items-center gap-3 rounded-xl p-4 text-center">
        {!step || status === "planning" ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted">
            <Loader2 size={15} className="animate-spin text-accent" /> Reading your cube…
          </p>
        ) : step.stage === "solved" ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <PartyPopper size={28} className="text-accent" />
            <p className="text-lg font-bold text-foreground">Solved!</p>
            <p className="text-xs text-muted">
              {reroutes === 0 ? "Not a single reroute." : `${reroutes} reroute${reroutes === 1 ? "" : "s"} along the way.`} Scramble it and the
              Sat-Nav picks straight back up.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-bold text-foreground">{step.title}</p>
              {step.grip && <p className="text-[11px] text-muted-2">{step.grip}</p>}
            </div>
            {status === "recalculating" ? (
              <p className="flex items-center gap-2 py-4 text-sm font-semibold text-warning">
                <RefreshCw size={15} className="animate-spin" /> Recalculating…
              </p>
            ) : step.stage === "lost" ? (
              <p className="py-2 text-xs text-muted">{step.title}</p>
            ) : hidden ? (
              <p className="flex items-center gap-2 py-4 text-xs text-muted-2">
                <EyeOff size={14} /> Coach mode — the route appears if you stall for {COACH_DELAY_MS / 1000}s
              </p>
            ) : (
              <RouteChips display={step.display} turns={step.turns} position={nav.position} partial={nav.partial} size="lg" />
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setCoach((c) => !c)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
            coach ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted hover:text-foreground",
          )}
        >
          {coach ? <EyeOff size={12} /> : <Eye size={12} />} Coach mode
        </button>
        <button
          type="button"
          onClick={replan}
          className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
        >
          <RefreshCw size={12} /> Replan
        </button>
      </div>
      <p className="max-w-sm text-center text-[11px] text-muted-2">
        Each turn&apos;s color swatch is the center that actually turns, so you can check the notation against your cube whichever way
        you&apos;re holding it. Coach mode hides directions until you stall — practice lookahead with a safety net.
      </p>
    </div>
  );
}

export default function SatNavPage() {
  const [mode, setMode] = useState<"navigate" | "learn">("navigate");
  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Navigation size={17} className="text-accent" /> Solve Sat-Nav
            </h1>
            <p className="text-[11px] text-muted-2">Turn-by-turn directions for the cube in your hands. Go off-route and it recalculates.</p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-bg-panel-2 p-1">
            {(
              [
                ["navigate", "Navigate", Navigation],
                ["learn", "Learn CFOP", GraduationCap],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold",
                  mode === id ? "bg-accent text-accent-fg" : "text-muted",
                )}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          <ConnectGate blurb="The Sat-Nav reads your cube's live state after every turn, so it needs a connected smart cube.">
            {mode === "navigate" ? <SatNav key="nav" /> : <SatNavLesson key="learn" />}
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
