"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Navigation, PartyPopper, RefreshCw, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { planNext } from "@/lib/satnav/client";
import type { NavStage, NavStep } from "@/lib/satnav/planner";
import { RouteTracker } from "@/lib/smartcube/route";
import { cn } from "@/lib/utils/cn";

/** Wait this long after an off-route turn before recalculating — people often fix a slip themselves in the next turn or two. */
const REROUTE_DEBOUNCE_MS = 450;
/** In coach mode, the next step only appears after you've been stuck this long. */
const COACH_DELAY_MS = 2500;

type Status = "planning" | "following" | "recalculating" | "error";

interface NavState {
  step: NavStep | null;
  position: number;
  partial: boolean;
  status: Status;
}

const STAGES: { id: NavStage[]; label: string }[] = [
  { id: ["cross"], label: "Cross" },
  { id: ["f2l"], label: "F2L" },
  { id: ["oll"], label: "OLL" },
  { id: ["pll", "auf"], label: "PLL" },
];

function StageBar({ step }: { step: NavStep | null }) {
  const current = step ? STAGES.findIndex((s) => s.id.includes(step.stage)) : -1;
  const solved = step?.stage === "solved";
  return (
    <div className="grid w-full grid-cols-4 gap-1.5">
      {STAGES.map((s, i) => {
        const done = solved || (current >= 0 && i < current);
        const active = i === current;
        return (
          <div key={s.label} className="flex flex-col items-center gap-1">
            <div className={cn("h-1.5 w-full rounded-full", done ? "bg-success" : active ? "bg-accent" : "bg-bg-panel-2")}>
              {active && s.label === "F2L" && step && (
                <div className="h-full rounded-full bg-success" style={{ width: `${(step.pairsDone / 4) * 100}%` }} />
              )}
            </div>
            <span className={cn("text-[10px] font-medium", active ? "text-accent" : done ? "text-success" : "text-muted-2")}>
              {s.label}
              {s.label === "F2L" && step && active ? ` ${step.pairsDone}/4` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Solve Sat-Nav: turn-by-turn directions for a real cube. It reads the cube's
 * live state after every turn, plans the next leg of a CFOP solve from
 * exactly there (optimal cross, the easiest pair and its insertion, then
 * the book OLL/PLL with the right AUF), and ticks the turns off as you make
 * them. Go off-route and it recalculates from wherever you ended up — so
 * it works from any state, mid-solve, mid-scramble, anywhere.
 */
function SatNav() {
  const [nav, setNav] = useState<NavState>({ step: null, position: 0, partial: false, status: "planning" });
  const [coach, setCoach] = useState(false);
  const [revealed, setRevealed] = useState(true);
  const [reroutes, setReroutes] = useState(0);
  const trackerRef = useRef<RouteTracker | null>(null);
  const requestRef = useRef(0);
  const rerouteTimer = useRef<number | null>(null);
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

  const replan = useCallback(() => {
    const id = ++requestRef.current;
    trackerRef.current = null;
    planNext(useSmartCubeStore.getState().liveFacelets)
      .then((step) => {
        if (id !== requestRef.current) return;
        trackerRef.current = new RouteTracker(step.turns);
        setNav({ step, position: 0, partial: false, status: "following" });
        armCoach();
      })
      .catch(() => id === requestRef.current && setNav((n) => ({ ...n, status: "error" })));
  }, [armCoach]);

  useEffect(() => {
    replan();
  }, [replan]);

  useEffect(() => {
    return subscribeRawMoves((move) => {
      armCoach();
      const tracker = trackerRef.current;
      if (!tracker) {
        // Mid-recalculation: the plan in flight is already stale — ask again once they pause.
        if (rerouteTimer.current) window.clearTimeout(rerouteTimer.current);
        rerouteTimer.current = window.setTimeout(replan, REROUTE_DEBOUNCE_MS);
        return;
      }
      const event = tracker.push(move.token);
      if (event === "off-route") {
        trackerRef.current = null;
        setReroutes((r) => r + 1);
        setNav((n) => ({ ...n, status: "recalculating" }));
        if (rerouteTimer.current) window.clearTimeout(rerouteTimer.current);
        rerouteTimer.current = window.setTimeout(replan, REROUTE_DEBOUNCE_MS);
        return;
      }
      setNav((n) => ({ ...n, position: tracker.position, partial: tracker.partial }));
      // Let the store apply this turn to the live state before planning from it.
      if (event === "done") window.setTimeout(replan, 30);
    });
  }, [replan, armCoach]);

  useEffect(
    () => () => {
      if (rerouteTimer.current) window.clearTimeout(rerouteTimer.current);
      if (coachTimer.current) window.clearTimeout(coachTimer.current);
    },
    [],
  );

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
          <ConnectGate blurb="The Sat-Nav reads your cube's live state after every turn, so it needs a connected smart cube.">
            <SatNav />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
