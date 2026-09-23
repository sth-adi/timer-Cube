"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Play, RotateCcw, Square, Target, Timer as TimerIcon, XCircle } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { TurnChips } from "@/components/smartcube/TurnChip";
import { CountdownRing } from "@/components/smartcube/CountdownRing";
import { useCubeSetup } from "@/hooks/useCubeSetup";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { useXCrossStore } from "@/lib/store/xcrossStore";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { Cube } from "@/lib/cube-engine/engine";
import { gradeXCross, xcrossOptions, type XCrossGrade, type XCrossSolution } from "@/lib/xcross/xcross";
import { solvedPair } from "@/lib/blindcross/grade";
import { PAIR_COLORS, crossSolved } from "@/lib/xray/common";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

type Phase = "idle" | "hunting" | "setup" | "inspect" | "solving" | "done";

const INSPECTION_MS = 15000;
const MAX_TRIES = 60;

interface Attempt {
  scramble: string;
  options: XCrossSolution[];
  grade: XCrossGrade;
  ms: number;
}

function PairSwatch({ pair }: { pair: number }) {
  return (
    <span className="inline-flex overflow-hidden rounded-[3px] ring-1 ring-black/30">
      {PAIR_COLORS[pair].map((c) => (
        <span key={c} className="h-3 w-2" style={{ background: c }} />
      ))}
    </span>
  );
}

function Report({ attempt }: { attempt: Attempt }) {
  const g = attempt.grade;
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col items-center gap-2 rounded-xl p-4 text-center">
        {g.hit ? <CheckCircle2 size={30} className="text-success" /> : <XCircle size={30} className="text-danger" />}
        <p className={cn("text-sm font-semibold", g.hit ? "text-success" : "text-danger")}>{g.verdict}</p>
        <p className="text-[11px] text-muted">{g.detail}</p>
        <div className="mt-1 grid w-full grid-cols-3 gap-2">
          {[
            [g.turns !== null ? `${g.turns}` : "—", "your turns"],
            [g.best ? `${g.best.moves.length}` : "—", "best x-cross"],
            [formatTime(attempt.ms), "to cross + pair"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-lg bg-bg-panel-2 px-2 py-1.5">
              <p className="text-base font-bold tabular-nums text-foreground">{v}</p>
              <p className="text-[10px] text-muted-2">{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card flex flex-col gap-3 rounded-xl p-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">What you did</p>
          {g.moves.length ? <TurnChips moves={g.turns !== null ? g.moves.slice(0, g.turns) : g.moves} /> : <p className="text-[11px] text-muted">No turns.</p>}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Every x-cross this scramble had</p>
          {attempt.options.map((o, i) => (
            <div key={o.pair} className={cn("flex flex-col gap-1.5 rounded-lg px-2.5 py-2", i === 0 ? "bg-accent-soft" : "bg-bg-panel-2")}>
              <p className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                <PairSwatch pair={o.pair} /> {o.label} · {o.moves.length} turns
                {g.pair === o.label && <span className="text-[10px] font-normal text-muted">(the pair you did)</span>}
              </p>
              <TurnChips moves={o.moves} />
            </div>
          ))}
          <p className="text-[10px] text-muted-2">Each chip is the center that turns — ↻ clockwise facing it, ↺ counter-clockwise. Pairs not listed need more turns.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * X-Cross Hunter: the app searches random-state scrambles until it finds
 * one with a short x-cross, sets it up on your cube, and gives you fifteen
 * seconds to find it too. Then it checks whether the cross and a pair
 * really came out together — and shows every x-cross you could have had.
 */
function Hunter() {
  const maxDepth = useXCrossStore((s) => s.maxDepth);
  const setMaxDepth = useXCrossStore((s) => s.setMaxDepth);
  const history = useXCrossStore((s) => s.history);
  const record = useXCrossStore((s) => s.record);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tries, setTries] = useState(0);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [now, setNow] = useState(0);
  const [inspectStart, setInspectStart] = useState(0);
  const [bestLen, setBestLen] = useState<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const scrambleRef = useRef("");
  const optionsRef = useRef<XCrossSolution[]>([]);
  const movesRef = useRef<string[]>([]);
  const firstMoveRef = useRef(0);
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const onReady = useCallback(() => {
    const t = performance.now();
    setInspectStart(t);
    setNow(t);
    setP("inspect");
  }, []);
  const { route, begin } = useCubeSetup(onReady);

  const finish = useCallback(
    (atMs: number) => {
      if (phaseRef.current !== "solving") return;
      const grade = gradeXCross(scrambleRef.current, movesRef.current, optionsRef.current);
      record({ date: Date.now(), maxDepth, hit: grade.hit, turns: grade.turns, best: grade.best?.moves.length ?? null });
      setAttempt({ scramble: scrambleRef.current, options: optionsRef.current, grade, ms: atMs - firstMoveRef.current });
      setP("done");
    },
    [record, maxDepth],
  );

  const hunt = async () => {
    setP("hunting");
    setTries(0);
    movesRef.current = [];
    for (let i = 1; i <= MAX_TRIES; i++) {
      setTries(i);
      const s = await getCubeEngineClient().generateScramble();
      await new Promise((r) => window.setTimeout(r, 0));
      const options = xcrossOptions(s, maxDepth);
      // Too short to be worth an inspection (or already done) — keep looking.
      if (options.length > 0 && options[0].moves.length >= 4) {
        scrambleRef.current = s;
        optionsRef.current = options;
        setBestLen(options[0].moves.length);
        setP("setup");
        begin(s);
        return;
      }
    }
    setP("idle");
  };

  useEffect(() => {
    return subscribeRawMoves((m) => {
      if (phaseRef.current === "inspect") {
        firstMoveRef.current = m.timeStampMs;
        setP("solving");
      }
      if (phaseRef.current !== "solving") return;
      movesRef.current.push(m.token);
      window.setTimeout(() => {
        const cube = Cube.fromString(useSmartCubeStore.getState().liveFacelets);
        if (crossSolved(cube) && solvedPair(cube) !== null) finish(m.timeStampMs);
      }, 0);
    });
  }, [finish]);

  useEffect(() => {
    if (phase !== "inspect") return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [phase]);

  const stats = useMemo(() => {
    const list = history.filter((h) => h.maxDepth === maxDepth);
    if (!list.length) return null;
    const hits = list.filter((h) => h.hit);
    const recent = list.slice(-20);
    const extra = hits.filter((h) => h.turns !== null && h.best !== null).map((h) => h.turns! - h.best!);
    return {
      attempts: list.length,
      hitRate: hits.length / list.length,
      recentRate: recent.filter((h) => h.hit).length / recent.length,
      avgExtra: extra.length ? extra.reduce((a, b) => a + b, 0) / extra.length : null,
    };
  }, [history, maxDepth]);

  return (
    <div className="flex flex-col gap-3">
      {(phase === "idle" || phase === "done") && (
        <div className="card flex flex-col gap-3 rounded-xl p-4">
          <div className="flex rounded-full bg-bg-panel-2 p-1">
            {[
              [7, "Easy · x-cross ≤ 7"],
              [8, "Normal · ≤ 8"],
            ].map(([d, label]) => (
              <button
                key={d}
                type="button"
                onClick={() => setMaxDepth(d as number)}
                className={cn("flex-1 rounded-full py-1.5 text-xs font-semibold", maxDepth === d ? "bg-accent text-accent-fg" : "text-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          {stats ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [`${Math.round(stats.hitRate * 100)}%`, `x-cross found · ${stats.attempts}`],
                [`${Math.round(stats.recentRate * 100)}%`, "last 20"],
                [stats.avgExtra !== null ? `+${stats.avgExtra.toFixed(1)}` : "—", "turns over best"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-lg bg-bg-panel-2 py-1.5">
                  <p className="text-base font-bold tabular-nums text-foreground">{v}</p>
                  <p className="text-[10px] text-muted-2">{l}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted">
              Every scramble here is hand-picked to have an x-cross in {maxDepth} turns or fewer. You get 15 seconds of inspection to find it — then
              solve the cross and a pair together. The attempt ends the moment both are in.
            </p>
          )}
          <button
            type="button"
            onClick={() => void hunt()}
            className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg"
          >
            {phase === "done" ? <RotateCcw size={14} /> : <Play size={14} />} {phase === "done" ? "Hunt another" : "Hunt a scramble"}
          </button>
        </div>
      )}

      {phase === "done" && attempt && <Report attempt={attempt} />}

      {phase === "hunting" && (
        <div className="card flex flex-col items-center gap-2 rounded-xl p-6 text-center text-sm text-muted">
          <Loader2 size={18} className="animate-spin text-accent" />
          Searching random scrambles for an x-cross in ≤ {maxDepth}…
          <span className="text-[11px] text-muted-2">checked {tries}</span>
        </div>
      )}

      {phase === "setup" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-foreground">Found one — scramble your cube</p>
          <p className="max-w-xs text-[11px] text-muted">Follow the turns. Inspection starts the moment it matches.</p>
          {route ? <RouteChips display={route.turns} turns={route.turns} position={route.position} partial={route.partial} variant="color" /> : <Loader2 size={16} className="animate-spin text-accent" />}
        </div>
      )}

      {phase === "inspect" && (
        <div className="card flex flex-col items-center gap-4 rounded-xl p-6 text-center">
          <CountdownRing remainingMs={INSPECTION_MS - (now - inspectStart)} totalMs={INSPECTION_MS} />
          <p className="text-sm font-semibold text-foreground">There&apos;s an x-cross in {bestLen ?? maxDepth}. Find it.</p>
          <p className="max-w-xs text-[11px] text-muted">Look for a corner and edge you can pair up on the way to the cross. Start turning when you&apos;ve got it.</p>
        </div>
      )}

      {phase === "solving" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-6 text-center">
          <Target size={26} className="animate-pulse text-accent" />
          <p className="text-sm font-semibold text-foreground">Cross + pair…</p>
          <button
            type="button"
            onClick={() => finish(performance.now())}
            className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-semibold text-foreground"
          >
            <Square size={11} fill="currentColor" /> Give up
          </button>
        </div>
      )}
    </div>
  );
}

export default function XCrossPage() {
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
              <Target size={17} className="text-accent" /> X-Cross Hunter
            </h1>
            <p className="text-[11px] text-muted-2">Scrambles picked for a short x-cross, set up on your cube — can you see it in 15 seconds?</p>
          </div>
          <ConnectGate blurb="X-Cross Hunter sets each scramble up on your cube and checks your cross and pair turn by turn, so it needs a connected smart cube.">
            <Hunter />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
