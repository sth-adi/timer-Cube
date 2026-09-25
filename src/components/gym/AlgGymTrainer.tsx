"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Dumbbell, Eye, Loader2, SkipForward, Trophy, XCircle } from "lucide-react";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { LiveCubeMimic } from "@/components/timer/LiveCubeMimic";
import { useSmartCubeStore, SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { useGymStore } from "@/lib/store/gymStore";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { RouteTracker } from "@/lib/smartcube/route";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { GYM_CASES, caseAverageMs, caseKey, explainMiss, pickNextCase, setupSequence, stepDoneFacelets, type GymCase, type GymGroup } from "@/lib/gym/algGym";
import { cn } from "@/lib/utils/cn";

/** An execution pause this long without finishing the case counts as a miss. */
const MISS_PAUSE_MS = 1500;

type Phase = "idle" | "setup" | "go" | "exec" | "result";

interface Result {
  c: GymCase;
  ok: boolean;
  recogMs: number;
  execMs: number;
  pb: boolean;
  message: string;
}

const secs = (ms: number) => (ms / 1000).toFixed(2);

/**
 * OLL/PLL drilling on a real cube, in *your* grip. Setup is genuinely
 * grip-agnostic (the color chips track which physical center turns, not
 * notation that only means something in one orientation), and — unlike an
 * earlier version of this drill — solving is too: nothing here checks or
 * asks for any particular way of holding the cube, because recognizing the
 * case is a fact about the cube's physical state, not which way you're
 * looking at it. The live cube (the real gyro twin on a gyro cube, a plain
 * mimic otherwise) stays on screen through setup and solving so you can
 * always see exactly what's really there, however you're holding it.
 */
function AlgGymInner() {
  const [groups, setGroups] = useState<GymGroup[]>(["PLL"]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState<GymCase | null>(null);
  const [route, setRoute] = useState<{ turns: string[]; position: number; partial: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [streak, setStreak] = useState(0);
  const stats = useGymStore((s) => s.stats);
  const record = useGymStore((s) => s.record);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);

  const phaseRef = useRef<Phase>("idle");
  const caseRef = useRef<GymCase | null>(null);
  const targetRef = useRef("");
  const trackerRef = useRef<RouteTracker | null>(null);
  const readyAtRef = useRef(0);
  const execRef = useRef<{ token: string; at: number }[]>([]);
  const missTimer = useRef<number | null>(null);
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // Every move since this rep's setup began (setup + exec), just for the
  // live mimic to replay — reset the instant a new case is picked. Not used
  // at all for a gyro cube, which reads the real cube state directly.
  const [repMoves, setRepMoves] = useState<{ token: string; timeStampMs: number }[]>([]);

  const pool = useMemo(() => GYM_CASES.filter((c) => groups.includes(c.group)), [groups]);

  const planSetup = useCallback(() => {
    const target = targetRef.current;
    const live = useSmartCubeStore.getState().liveFacelets;
    if (live === scrambleToFacelets(target)) {
      trackerRef.current = null;
      setRoute(null);
      readyAtRef.current = performance.now();
      execRef.current = [];
      setP("go");
      return;
    }
    // From a solved cube the setup is simply the sequence itself — shorter
    // and more natural than a solver route between two arbitrary states.
    if (live === SOLVED_FACELETS) {
      const turns = target.split(/\s+/).filter(Boolean);
      trackerRef.current = new RouteTracker(turns);
      setRoute({ turns, position: 0, partial: false });
      return;
    }
    getCubeEngineClient()
      .computeCorrectiveMoves(target, live)
      .then((turns) => {
        if (targetRef.current !== target || phaseRef.current !== "setup") return;
        trackerRef.current = new RouteTracker(turns);
        setRoute({ turns, position: 0, partial: false });
      })
      .catch(() => setRoute(null));
  }, []);

  const next = useCallback(() => {
    const s = useGymStore.getState().stats;
    const c = pickNextCase(pool, s, caseRef.current ? caseKey(caseRef.current) : null);
    caseRef.current = c;
    setCurrent(c);
    setResult(null);
    setRoute(null);
    setRepMoves([]);
    targetRef.current = setupSequence(c);
    setP("setup");
    planSetup();
  }, [pool, planSetup]);

  const conclude = useCallback(
    (ok: boolean) => {
      const c = caseRef.current;
      if (!c) return;
      if (missTimer.current) window.clearTimeout(missTimer.current);
      const moves = execRef.current;
      const first = moves[0]?.at ?? performance.now();
      const last = moves[moves.length - 1]?.at ?? first;
      const recogMs = Math.max(0, first - readyAtRef.current);
      const execMs = last - first;
      const prevBest = useGymStore.getState().stats[caseKey(c)]?.bestMs ?? null;
      record(caseKey(c), ok, execMs, recogMs);
      setStreak((s) => (ok ? s + 1 : 0));
      setResult({
        c,
        ok,
        recogMs,
        execMs,
        pb: ok && (prevBest === null || execMs < prevBest),
        message: ok ? "Clean." : explainMiss(c, moves.map((m) => m.token)),
      });
      setP("result");
    },
    [record],
  );

  useEffect(() => {
    return subscribeRawMoves((m) => {
      const p = phaseRef.current;
      if (p === "idle" || p === "result") return;
      setRepMoves((ms) => [...ms, { token: m.token, timeStampMs: m.timeStampMs }]);
      if (p === "setup") {
        const tracker = trackerRef.current;
        const event = tracker?.push(m.token);
        window.setTimeout(() => {
          if (phaseRef.current !== "setup") return;
          if (!tracker || event === "off-route" || useSmartCubeStore.getState().liveFacelets === scrambleToFacelets(targetRef.current)) {
            planSetup();
          } else {
            setRoute((r) => (r ? { ...r, position: tracker.position, partial: tracker.partial } : r));
          }
        }, 0);
        return;
      }
      if (p === "go" || p === "exec") {
        if (p === "go") setP("exec");
        execRef.current.push({ token: m.token, at: m.timeStampMs });
        if (missTimer.current) window.clearTimeout(missTimer.current);
        window.setTimeout(() => {
          const c = caseRef.current;
          if (phaseRef.current !== "exec" || !c) return;
          if (stepDoneFacelets(c.group, useSmartCubeStore.getState().liveFacelets)) conclude(true);
          else missTimer.current = window.setTimeout(() => phaseRef.current === "exec" && conclude(false), MISS_PAUSE_MS);
        }, 0);
      }
    });
  }, [planSetup, conclude]);

  useEffect(() => () => void (missTimer.current && window.clearTimeout(missTimer.current)), []);

  const toggleGroup = (g: GymGroup) => setGroups((gs) => (gs.includes(g) ? (gs.length > 1 ? gs.filter((x) => x !== g) : gs) : [...gs, g]));

  const table = useMemo(
    () =>
      pool
        .map((c) => ({ c, s: stats[caseKey(c)] }))
        .filter((r) => r.s && r.s.attempts > 0)
        .sort((a, b) => (caseAverageMs(b.s) ?? 0) - (caseAverageMs(a.s) ?? 0)),
    [pool, stats],
  );

  const algCase = result?.c ?? current;
  const live = phase === "setup" || phase === "go" || phase === "exec";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex gap-1.5">
          {(["PLL", "OLL"] as GymGroup[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGroup(g)}
              disabled={phase !== "idle" && phase !== "result"}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                groups.includes(g) ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted",
              )}
            >
              {g}
            </button>
          ))}
        </div>
        {streak > 1 && <span className="text-xs font-semibold text-success">{streak} in a row</span>}
      </div>

      <div className="card flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl p-5 text-center">
        {phase === "idle" && (
          <>
            <Dumbbell size={28} className="text-accent" />
            <p className="max-w-xs text-xs text-muted">
              The gym sets each case up on your cube, then times you recognizing and solving it — and tells you if you did the wrong
              algorithm. Any grip, the whole way through: it reads the case from the cube&apos;s own state, not which way you&apos;re
              holding it. Weak and slow cases come up more.
            </p>
            <button type="button" onClick={next} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg">
              Start drilling
            </button>
          </>
        )}

        {live && (
          <div className="h-36 w-full max-w-[11rem]">
            {gyroActive ? <GyroTwin size={110} showControls={false} className="mx-auto" /> : <LiveCubeMimic scramble="" moves={repMoves} className="h-full w-full" />}
          </div>
        )}

        {phase === "setup" && (
          <>
            <p className="text-sm font-semibold text-foreground">Set up the next case</p>
            <p className="text-[11px] text-muted">Any grip — just follow the centers. Don&apos;t peek at the result until it&apos;s done.</p>
            {route ? (
              <RouteChips display={route.turns} turns={route.turns} position={route.position} partial={route.partial} variant="color" />
            ) : (
              <Loader2 size={16} className="animate-spin text-accent" />
            )}
          </>
        )}

        {(phase === "go" || phase === "exec") && (
          <>
            <p className="flex items-center gap-1.5 text-lg font-black text-foreground">
              <Eye size={18} className="text-accent" /> {phase === "go" ? "Recognize it" : "Solve it"}
            </p>
            <p className="text-[11px] text-muted">Whatever grip you landed in is fine — the clock is already running.</p>
          </>
        )}

        {phase === "result" && result && algCase && (
          <>
            <div className="flex items-center gap-3">
              <CaseIcon setupAlg={invertAlg(algCase.alg)} kind={algCase.group} className="h-16 w-16 shrink-0 overflow-hidden rounded" />
              <div className="flex flex-col items-start">
                <p className={cn("flex items-center gap-1.5 text-lg font-bold", result.ok ? "text-success" : "text-danger")}>
                  {result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />} {algCase.group} · {algCase.name}
                </p>
                {result.ok && (
                  <p className="text-xs tabular-nums text-muted">
                    see <span className="font-semibold text-foreground">{secs(result.recogMs)}s</span> · do{" "}
                    <span className="font-semibold text-foreground">{secs(result.execMs)}s</span>
                    {result.pb && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-accent">
                        <Trophy size={11} /> PB
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <p className={cn("text-xs", result.ok ? "text-muted" : "text-danger")}>{result.message}</p>
            <p className="font-mono text-[11px] text-muted-2">{algCase.alg}</p>
          </>
        )}
      </div>

      {(phase === "result" || phase === "setup" || phase === "go" || phase === "exec") && (
        <div className="flex justify-center gap-2">
          {phase === "result" ? (
            <button type="button" onClick={next} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg">
              Next case
            </button>
          ) : (
            <button type="button" onClick={next} className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-medium text-muted">
              <SkipForward size={12} /> Skip
            </button>
          )}
        </div>
      )}

      {table.length > 0 && (
        <div className="card flex flex-col gap-1 rounded-xl p-3">
          <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
            <span>Your cases, slowest first</span>
            <span>see + do · best · hit rate</span>
          </div>
          {table.map(({ c, s }) => (
            <div key={caseKey(c)} className="flex items-center gap-2 rounded-lg bg-bg-panel-2 px-2 py-1.5">
              <CaseIcon setupAlg={invertAlg(c.alg)} kind={c.group} className="h-7 w-7 shrink-0 overflow-hidden rounded-[2px]" />
              <span className="flex-1 truncate text-[11px] font-medium text-foreground">{c.name}</span>
              <span className="text-[10px] tabular-nums text-muted">
                {caseAverageMs(s) !== null ? `${secs(caseAverageMs(s)!)}s` : "—"} · {s!.bestMs !== null ? `${secs(s!.bestMs)}s` : "—"} ·{" "}
                {Math.round((s!.successes / s!.attempts) * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Alg Gym: OLL/PLL drills on a real cube — setup checked turn by turn,
 * recognition and execution timed off the cube itself, wrong algorithms
 * caught and named. Needs a connected smart cube.
 */
export function AlgGymTrainer() {
  return (
    <ConnectGate blurb="The Alg Gym sets up cases on your cube and times you off its turns, so it needs a connected smart cube.">
      <AlgGymInner />
    </ConnectGate>
  );
}
