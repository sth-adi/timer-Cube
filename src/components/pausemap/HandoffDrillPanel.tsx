"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { useCubeSetup } from "@/hooks/useCubeSetup";
import { SOLVED_FACELETS, useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { Cube } from "@/lib/cube-engine/engine";
import { HandoffTracker, drillFor, type DrillResult, type HandoffDrill, type PairStretch, type SolveCapture } from "@/lib/pausemap/pauseMap";
import { usePauseDrillStore } from "@/lib/store/pauseDrillStore";
import { cn } from "@/lib/utils/cn";

type Phase = "idle" | "preparing" | "setup" | "drilling" | "done";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/**
 * Replays the exact positions where you stalled. The cube is set to a
 * moment one stretch *before* the stall — so you finish the previous pair
 * (or the cross) yourself, and the drill times what lookahead should
 * remove: the gap between that pair going in and your next turn. Then it
 * follows you until the next pair is in.
 *
 * Every event is timed on arrival with one clock (performance.now), not the
 * cube's own timestamps, so the "ready" moment and your turns line up.
 */
export function HandoffDrillPanel({
  examples,
  captures,
  label,
  onClose,
}: {
  examples: PairStretch[];
  captures: Map<string, SolveCapture>;
  label: string;
  onClose: () => void;
}) {
  const record = usePauseDrillStore((s) => s.record);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [drill, setDrill] = useState<HandoffDrill | null>(null);
  const [trackerPhase, setTrackerPhase] = useState<HandoffTracker["phase"]>("lead-in");
  const [result, setResult] = useState<DrillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const drillRef = useRef<HandoffDrill | null>(null);
  const trackerRef = useRef<HandoffTracker | null>(null);
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const onReady = useCallback(() => {
    if (!drillRef.current) return;
    trackerRef.current = new HandoffTracker(drillRef.current, performance.now());
    setTrackerPhase(trackerRef.current.phase);
    setP("drilling");
  }, []);
  const { route, begin, stop } = useCubeSetup(onReady);

  const load = useCallback(
    async (i: number) => {
      const example = examples[i % examples.length];
      const solve = example && captures.get(example.solveId);
      if (!example || !solve) return;
      const d = drillFor(example, solve);
      drillRef.current = d;
      try {
        // Your scramble plus your own moves is a long way to turn by hand;
        // the same position is usually ~20 turns from solved.
        const short = (await getCubeEngineClient().computeCorrectiveMoves(d.setupAlg, SOLVED_FACELETS)).join(" ");
        if (drillRef.current !== d) return; // moved on to another position meanwhile
        setDrill(d);
        setP("setup");
        begin(short);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [examples, captures, begin],
  );

  useEffect(() => () => stop(), [stop]);

  useEffect(
    () =>
      subscribeRawMoves(() => {
        if (phaseRef.current !== "drilling") return;
        const at = performance.now();
        // Read the cube after the store has applied this move.
        window.setTimeout(() => {
          const tracker = trackerRef.current;
          const d = drillRef.current;
          if (!tracker || !d || phaseRef.current !== "drilling") return;
          const res = tracker.move(Cube.fromString(useSmartCubeStore.getState().liveFacelets), at);
          setTrackerPhase(tracker.phase);
          if (!res) return;
          setResult(res);
          setP("done");
          record({
            date: Date.now(),
            order: d.order,
            findMs: res.findMs,
            totalMs: res.totalMs,
            turns: res.turns,
            fewestTurns: d.fewestTurns,
            originalFindMs: d.originalFindMs,
            multislot: res.multislot,
          });
        }, 0);
      }),
    [record],
  );

  const start = (i: number) => {
    setIndex(i);
    setP("preparing");
    setResult(null);
    setError(null);
    void load(i);
  };

  return (
    <ConnectGate blurb="The hand-off drill sets your own stalled positions up on a smart cube and times your lookahead through them.">
      <div className="card flex flex-col gap-3 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Drill: {label.toLowerCase()}</p>
          <button type="button" onClick={onClose} aria-label="Close drill" className="tap-target rounded-full text-muted hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <p className="text-[10px] text-muted-2">
          Position {(index % examples.length) + 1} of {examples.length}, from your own solves — each one a spot where you stopped to look.
        </p>

        {error && <p className="text-xs text-danger">{error}</p>}

        {phase === "idle" && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] leading-relaxed text-muted">
              Your cube gets set to a moment one step before a stall. Finish that step (the pair, or the cross) as you normally would and keep
              going into the next pair — the drill times the gap between them. It walks the cube there from whatever state it&apos;s in.
            </p>
            <button type="button" onClick={() => start(0)} className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
              Set up position 1
            </button>
          </div>
        )}

        {phase === "preparing" && !error && (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-accent" />
          </div>
        )}

        {phase === "setup" && (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-muted">Set the cube up — the drill starts when it matches.</p>
            {route ? (
              <RouteChips display={route.turns} turns={route.turns} position={route.position} partial={route.partial} variant="color" />
            ) : (
              <Loader2 size={16} className="animate-spin text-accent" />
            )}
          </div>
        )}

        {phase === "drilling" && drill && (
          <div className="flex flex-col items-center gap-1 py-3 text-center">
            <p className={cn("text-lg font-bold", trackerPhase === "finding" ? "text-danger" : "text-foreground")}>
              {trackerPhase === "lead-in"
                ? drill.order === 1
                  ? "Solve the cross — and look for your first pair while you do"
                  : "Finish this pair — and find the next one while you do"
                : trackerPhase === "finding"
                  ? "Keep turning — next pair!"
                  : "Get the next pair in"}
            </p>
            <p className="text-[11px] text-muted-2">In your solve you paused {secs(drill.originalFindMs)} here.</p>
          </div>
        )}

        {phase === "done" && result && drill && (
          <div className="flex flex-col gap-2">
            {result.multislot ? (
              <p className="text-center text-xs text-muted">Two pairs went in together — no hand-off to time. Nice, if you meant it.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  [secs(result.findMs), `pause (was ${secs(drill.originalFindMs)})`, result.findMs < drill.originalFindMs],
                  [`${result.turns}`, `turns (fewest ${drill.fewestTurns})`, result.turns <= drill.fewestTurns + 2],
                  [secs(result.totalMs), "hand-off to pair in", null],
                ].map(([v, l, good]) => (
                  <div key={l as string} className="rounded-lg bg-bg-panel-2 px-2 py-1.5">
                    <p className={cn("text-base font-bold tabular-nums", good === true ? "text-success" : good === false ? "text-warning" : "text-foreground")}>{v}</p>
                    <p className="text-[10px] text-muted-2">{l}</p>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => start(index + 1)} className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
              <RotateCcw size={14} /> Next position
            </button>
          </div>
        )}
      </div>
    </ConnectGate>
  );
}
