"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Radio, RotateCcw, Swords, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { TurnChips } from "@/components/smartcube/TurnChip";
import { useCubeSetup } from "@/hooks/useCubeSetup";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore, SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { compareSolves, type Comparison } from "@/lib/rematch/compare";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import type { Solve } from "@/types";

type Phase = "pick" | "setup" | "ready" | "solving" | "done";

const signed = (ms: number | null) => (ms === null ? "—" : `${ms < 0 ? "−" : "+"}${(Math.abs(ms) / 1000).toFixed(2)}`);

function Result({ c, original }: { c: Comparison; original: Solve }) {
  const faster = c.totalB < c.totalA;
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col items-center gap-1 rounded-xl p-4 text-center">
        <p className={cn("text-sm font-semibold", faster ? "text-success" : "text-foreground")}>{c.verdict}</p>
        <div className="mt-1 grid w-full grid-cols-2 gap-2">
          {(
            [
              ["Original", c.totalA, c.turnsA, new Date(original.date).toLocaleDateString()],
              ["Rematch", c.totalB, c.turnsB, "just now"],
            ] as const
          ).map(([label, ms, turns, when]) => (
            <div key={label} className={cn("rounded-lg px-2 py-2", label === "Rematch" && faster ? "bg-success/15" : "bg-bg-panel-2")}>
              <p className="text-[10px] text-muted-2">
                {label} · {when}
              </p>
              <p className="tabular-timer text-2xl font-bold text-foreground">{formatTime(ms)}</p>
              <p className="text-[10px] text-muted">
                {turns} turns · {((turns / Math.max(1, ms)) * 1000).toFixed(2)} TPS
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card flex flex-col gap-2 rounded-xl p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Stretch by stretch</p>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-[11px]">
          <span className="text-muted-2" />
          <span className="text-right text-muted-2">before</span>
          <span className="text-right text-muted-2">now</span>
          <span className="text-right text-muted-2">Δ</span>
          {c.stretches.map((r) => (
            <div key={r.label} className="contents">
              <span className="text-foreground">{r.label}</span>
              <span className="text-right tabular-nums text-muted">{r.a === null ? "—" : formatTime(r.a)}</span>
              <span className="text-right tabular-nums text-muted">{r.b === null ? "—" : formatTime(r.b)}</span>
              <span
                className={cn(
                  "text-right font-semibold tabular-nums",
                  r.delta === null ? "text-muted-2" : r.delta < -100 ? "text-success" : r.delta > 100 ? "text-danger" : "text-muted",
                )}
              >
                {signed(r.delta)}
              </span>
            </div>
          ))}
        </div>
        {c.notes.map((n) => (
          <p key={n} className="text-[11px] text-muted">
            {n}
          </p>
        ))}
      </div>

      <div className="card flex flex-col gap-3 rounded-xl p-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Cross before ({c.crossA.length})</p>
          <TurnChips moves={c.crossA} />
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Cross now ({c.crossB.length})</p>
          <TurnChips moves={c.crossB} />
        </div>
        {(c.orderA.length > 0 || c.orderB.length > 0) && (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {(
              [
                ["Pair order before", c.orderA],
                ["Pair order now", c.orderB],
              ] as const
            ).map(([label, order]) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-lg bg-bg-panel-2 px-2.5 py-2">
                <span className="text-[10px] text-muted-2">{label}</span>
                {order.map((p, i) => (
                  <span key={i} className="text-foreground">
                    {i + 1}. {p}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Solve Rematch: pick any past smart-cube solve, the app puts that exact
 * scramble back on your cube, you solve it again — and see, stretch by
 * stretch and path by path, how the rematch compares with the original.
 */
function Rematch() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const candidates = useMemo(
    () =>
      allSolves
        .filter((s) => s.scramble && s.reconstruction && s.moveTimestamps && s.moveTimestamps.length > 0 && s.penalty !== "dnf")
        .sort((a, b) => b.date - a.date)
        .slice(0, 40),
    [allSolves],
  );
  const [phase, setPhase] = useState<Phase>("pick");
  const [original, setOriginal] = useState<Solve | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const phaseRef = useRef<Phase>("pick");
  const originalRef = useRef<Solve | null>(null);
  const movesRef = useRef<{ token: string; at: number }[]>([]);
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const onReady = useCallback(() => setP("ready"), []);
  const { route, begin, stop } = useCubeSetup(onReady);

  const pick = (s: Solve) => {
    originalRef.current = s;
    setOriginal(s);
    setComparison(null);
    movesRef.current = [];
    setP("setup");
    begin(s.scramble);
  };

  const finish = useCallback(() => {
    const o = originalRef.current;
    if (!o) return;
    const first = movesRef.current[0]?.at ?? 0;
    const c = compareSolves(
      o.scramble,
      { moves: o.reconstruction!.split(/\s+/).filter(Boolean), timesMs: o.moveTimestamps!, totalMs: o.timeMs },
      { moves: movesRef.current.map((m) => m.token), timesMs: movesRef.current.map((m) => m.at - first) },
    );
    setComparison(c);
    setP("done");
  }, []);

  useEffect(() => {
    return subscribeRawMoves((m) => {
      if (phaseRef.current === "ready") setP("solving");
      if (phaseRef.current !== "solving") return;
      movesRef.current.push({ token: m.token, at: m.timeStampMs });
      window.setTimeout(() => {
        if (phaseRef.current === "solving" && useSmartCubeStore.getState().liveFacelets === SOLVED_FACELETS) finish();
      }, 0);
    });
  }, [finish]);

  useEffect(() => {
    if (phase !== "solving") return;
    let raf = 0;
    const tick = () => {
      const first = movesRef.current[0]?.at;
      if (first !== undefined) setElapsed(performance.now() - first);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (phase === "pick") {
    return candidates.length === 0 ? (
      <div className="card rounded-xl p-6 text-center text-sm text-muted">Solve on your smart cube first — every solve you finish can be rematched here.</div>
    ) : (
      <div className="card flex flex-col gap-1 rounded-xl p-2">
        <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-2">Pick a solve to rematch</p>
        {candidates.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => pick(s)}
            className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-bg-panel-2"
          >
            <span className="flex flex-col">
              <span className="tabular-timer text-sm font-semibold text-foreground">{formatTime(s.timeMs)}</span>
              <span className="text-[10px] text-muted-2">
                {new Date(s.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ·{" "}
                {s.reconstruction!.split(/\s+/).length} turns
              </span>
            </span>
            <Swords size={14} className="text-muted-2" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          stop();
          setP("pick");
        }}
        className="flex items-center gap-1 self-start text-xs font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft size={13} /> Pick another solve
      </button>

      {original && phase !== "done" && (
        <div className="card flex items-center justify-between rounded-xl px-4 py-3">
          <span className="text-[11px] text-muted">Original</span>
          <span className="tabular-timer text-lg font-bold text-foreground">{formatTime(original.timeMs)}</span>
        </div>
      )}

      {phase === "setup" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-foreground">Put the scramble back on your cube</p>
          {route ? <RouteChips display={route.turns} turns={route.turns} position={route.position} partial={route.partial} variant="color" /> : <Loader2 size={16} className="animate-spin text-accent" />}
        </div>
      )}

      {phase === "ready" && (
        <div className="card flex flex-col items-center gap-2 rounded-xl p-6 text-center">
          <Radio size={20} className="animate-pulse text-accent" />
          <p className="text-sm font-semibold text-foreground">Same scramble. Inspect, then go.</p>
          <p className="text-[11px] text-muted">The clock starts on your first turn and stops when the cube is solved.</p>
        </div>
      )}

      {phase === "solving" && (
        <div className="card flex flex-col items-center gap-1 rounded-xl p-6 text-center">
          <p className="tabular-timer text-6xl font-bold text-foreground">{formatTime(elapsed)}</p>
          <p className={cn("text-xs font-medium", original && elapsed > original.timeMs ? "text-danger" : "text-muted")}>
            {original && (elapsed > original.timeMs ? "behind the original" : `original: ${formatTime(original.timeMs)}`)}
          </p>
        </div>
      )}

      {phase === "done" && comparison && original && (
        <>
          <Result c={comparison} original={original} />
          <button
            type="button"
            onClick={() => pick(original)}
            className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg"
          >
            <RotateCcw size={14} /> Rematch it again
          </button>
        </>
      )}
    </div>
  );
}

export default function RematchPage() {
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
              <Swords size={17} className="text-accent" /> Solve Rematch
            </h1>
            <p className="text-[11px] text-muted-2">Any past solve, back on your cube — then see exactly where the rematch won or lost.</p>
          </div>
          <ConnectGate blurb="Solve Rematch puts an old scramble back on your cube and times the new solve, so it needs a connected smart cube.">
            <Rematch />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
