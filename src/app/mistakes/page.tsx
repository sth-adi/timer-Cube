"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bandage, CheckCircle2, ChevronLeft, Crosshair, Loader2, RotateCcw, Square, XCircle } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { TurnChips } from "@/components/smartcube/TurnChip";
import { useCubeSetup } from "@/hooks/useCubeSetup";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { useMyAlgsStore } from "@/lib/store/myAlgsStore";
import { useMistakeDrillStore, type DrillRecord } from "@/lib/store/mistakeDrillStore";
import { planNext } from "@/lib/satnav/client";
import { Cube } from "@/lib/cube-engine/engine";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { KIND_LABEL } from "@/lib/analysis/mistakeRadar";
import { collectDrills, goalReached, gradeAttempt, routeToGoal, type Drill, type DrillGrade, type RouteLeg } from "@/lib/drills/mistakeDrill";
import { cn } from "@/lib/utils/cn";

const s2 = (ms: number) => (ms / 1000).toFixed(2);
const GOAL_TEXT = { Cross: "the cross is done", F2L: "F2L is done", OLL: "the last layer is oriented", PLL: "the cube is solved" } as const;
const wallNow = () => Date.now();

type Phase = "setup" | "ready" | "solving" | "done";

function drillStatus(records: readonly DrillRecord[]): { label: string; tone: "good" | "bad" | "none" } {
  if (!records.length) return { label: "not tried", tone: "none" };
  const last3 = records.slice(-3);
  if (last3.length >= 2 && last3.every((r) => !r.repeated)) return { label: "fixed", tone: "good" };
  const last = records[records.length - 1];
  return last.repeated ? { label: "happened again", tone: "bad" } : { label: "clean once", tone: "good" };
}

function Runner({ drill, onBack }: { drill: Drill; onBack: () => void }) {
  const record = useMistakeDrillStore((s) => s.record);
  const [phase, setPhase] = useState<Phase>("setup");
  const [grade, setGrade] = useState<DrillGrade | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [route, setRoute] = useState<RouteLeg[] | null | "loading">("loading");
  const phaseRef = useRef<Phase>("setup");
  const movesRef = useRef<string[]>([]);
  const timesRef = useRef<number[]>([]);
  const firstRef = useRef(0);
  const routeRef = useRef<RouteLeg[] | null>(null);
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const onReady = useCallback(() => setP("ready"), []);
  const { route: setupRoute, begin, stop } = useCubeSetup(onReady);

  const start = useCallback(() => {
    movesRef.current = [];
    timesRef.current = [];
    setMoves([]);
    setGrade(null);
    setP("setup");
    begin(drill.setup);
  }, [begin, drill.setup]);

  // Runner is keyed by drill, so it mounts fresh in "setup" for each one.
  useEffect(() => {
    begin(drill.setup);
    // The Sat-Nav's route from the same position, for comparison afterwards.
    let live = true;
    const chosen = useMyAlgsStore.getState().chosen;
    routeToGoal(scrambleToFacelets(drill.setup), drill.goal, (f) => planNext(f, chosen))
      .then((legs) => {
        if (!live) return;
        routeRef.current = legs;
        setRoute(legs);
      })
      .catch(() => live && setRoute(null));
    return () => {
      live = false;
      stop();
    };
  }, [drill, begin, stop]);

  const finish = useCallback(() => {
    if (phaseRef.current !== "solving") return;
    const legs = routeRef.current;
    const g = gradeAttempt(drill, { moves: movesRef.current, timesMs: timesRef.current }, legs ? legs.reduce((a, l) => a + l.turns, 0) : null);
    record({ drillId: drill.id, date: wallNow(), turns: g.turns, ms: g.ms, repeated: g.repeated });
    setGrade(g);
    setMoves([...movesRef.current]);
    setP("done");
  }, [drill, record]);

  useEffect(() => {
    return subscribeRawMoves((m) => {
      if (phaseRef.current === "ready") {
        firstRef.current = m.timeStampMs;
        setP("solving");
      }
      if (phaseRef.current !== "solving") return;
      movesRef.current.push(m.token);
      timesRef.current.push(m.timeStampMs - firstRef.current);
      setMoves([...movesRef.current]);
      // The store applies the turn right after the bus emits it.
      window.setTimeout(() => {
        if (goalReached(Cube.fromString(useSmartCubeStore.getState().liveFacelets), drill.goal)) finish();
      }, 0);
    });
  }, [drill.goal, finish]);

  const legs = route === "loading" ? null : route;

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start px-1 text-[11px] font-medium text-muted hover:text-foreground">
        <ChevronLeft size={12} /> All drills
      </button>
      <div className="card flex flex-col gap-1 rounded-xl p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
          {KIND_LABEL[drill.mistake.kind]} · {drill.mistake.phase} · cost {s2(drill.mistake.costMs)}s
        </p>
        <p className="text-sm font-semibold text-foreground">{drill.mistake.title}</p>
        <p className="text-[11px] text-muted">{drill.mistake.detail}</p>
        <p className="mt-1 text-[11px] text-muted-2">
          Originally: {drill.original.turns} turns, {s2(drill.original.ms)}s until {GOAL_TEXT[drill.goal]}.
        </p>
      </div>

      {phase === "setup" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-foreground">Put your cube back to that moment</p>
          <p className="max-w-xs text-[11px] text-muted">Hold it yellow top, green front and follow the turns — it&apos;s the solve&apos;s scramble plus your own turns up to the mistake.</p>
          {setupRoute ? (
            <RouteChips display={setupRoute.turns} turns={setupRoute.turns} position={setupRoute.position} partial={setupRoute.partial} variant="color" />
          ) : (
            <Loader2 size={16} className="animate-spin text-accent" />
          )}
        </div>
      )}

      {phase === "ready" && (
        <div className="card flex flex-col items-center gap-2 rounded-xl p-6 text-center">
          <Crosshair size={26} className="text-accent" />
          <p className="text-sm font-semibold text-foreground">You&apos;re at the spot. Do it properly this time.</p>
          <p className="max-w-xs text-[11px] text-muted">Take a look first — the clock starts on your first turn and stops when {GOAL_TEXT[drill.goal]}.</p>
        </div>
      )}

      {phase === "solving" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Going… {moves.length} turns</p>
          <p className="text-[11px] text-muted">Stops when {GOAL_TEXT[drill.goal]}.</p>
          <button type="button" onClick={finish} className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-semibold text-foreground">
            <Square size={11} fill="currentColor" /> Give up
          </button>
        </div>
      )}

      {phase === "done" && grade && (
        <div className="card flex flex-col gap-3 rounded-xl p-4">
          <div className="flex flex-col items-center gap-2 text-center">
            {grade.repeated ? <XCircle size={30} className="text-danger" /> : <CheckCircle2 size={30} className="text-success" />}
            <p className={cn("text-sm font-semibold", grade.repeated ? "text-danger" : "text-success")}>{grade.verdict}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              [`${grade.turns}`, `turns (was ${drill.original.turns})`],
              [`${s2(grade.ms)}s`, `time (was ${s2(drill.original.ms)}s)`],
              [grade.vsRouteTurns === null ? "—" : `${grade.vsRouteTurns > 0 ? "+" : ""}${grade.vsRouteTurns}`, "vs Sat-Nav"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg bg-bg-panel-2 px-2 py-1.5">
                <p className="text-base font-bold tabular-nums text-foreground">{v}</p>
                <p className="text-[10px] text-muted-2">{l}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">What you did</p>
            {moves.length ? <TurnChips moves={moves} /> : <p className="text-[11px] text-muted">No turns.</p>}
          </div>
          {legs && legs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">The Sat-Nav&apos;s way from here</p>
              {legs.map((l, i) => (
                <div key={i} className="rounded-lg bg-bg-panel-2 px-2.5 py-1.5">
                  <p className="text-[11px] font-semibold text-foreground">
                    {l.title} · {l.turns} turns
                  </p>
                  <p className="break-words font-mono text-[11px] text-muted">{l.display.join(" ")}</p>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={start} className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
            <RotateCcw size={14} /> Again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Mistake Drills: the costliest moments the Mistake Radar found in your
 * smart-cube solves, each set back up on your cube exactly as it was so
 * you can redo that stretch properly — graded against what you did then,
 * the Sat-Nav's route, and whether the same mistake happened again.
 */
export default function MistakeDrillsPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const history = useMistakeDrillStore((s) => s.history);
  const drills = useMemo(() => collectDrills(allSolves), [allSolves]);
  const [active, setActive] = useState<Drill | null>(null);

  return (
    <AnalyticsShell icon={<Bandage size={17} className="text-accent" />} title="Mistake Drills" subtitle="Your costliest mistakes, set back up on your cube — redo them until they're fixed.">
      {active ? (
        <ConnectGate blurb="Mistake Drills put your cube back to the exact moment of a mistake and watch your retry turn by turn, so they need a connected smart cube.">
          <Runner key={active.id} drill={active} onBack={() => setActive(null)} />
        </ConnectGate>
      ) : drills.length === 0 ? (
        <div className="card rounded-xl p-6 text-center text-sm text-muted">No mistakes to drill yet — they come from smart-cube solves the Mistake Radar has flagged.</div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-[11px] text-muted">
            {drills.length} drill{drills.length === 1 ? "" : "s"} from your recent smart-cube solves, costliest first. Two clean retries in a row and a drill counts as fixed.
          </p>
          {drills.map((d) => {
            const recs = history.filter((r) => r.drillId === d.id);
            const status = drillStatus(recs);
            return (
              <button key={d.id} type="button" onClick={() => setActive(d)} className="card flex items-center gap-3 rounded-xl p-3 text-left hover:ring-1 hover:ring-accent/40">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-bg-panel-2 py-1.5">
                  <span className="text-sm font-bold tabular-nums text-danger">{s2(d.mistake.costMs)}s</span>
                  <span className="text-[9px] text-muted-2">lost</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-semibold text-foreground">{d.mistake.title}</p>
                  <p className="text-[11px] text-muted">
                    {KIND_LABEL[d.mistake.kind]} · {d.mistake.phase} · {new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {recs.length ? ` · ${recs.length} tr${recs.length === 1 ? "y" : "ies"}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    status.tone === "good" ? "bg-success/15 text-success" : status.tone === "bad" ? "bg-danger/15 text-danger" : "bg-bg-panel-2 text-muted-2",
                  )}
                >
                  {status.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </AnalyticsShell>
  );
}
