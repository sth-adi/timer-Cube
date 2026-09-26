"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, GraduationCap, Lightbulb, Loader2, PartyPopper, RefreshCw } from "lucide-react";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import type { NavStep } from "@/lib/satnav/planner";
import { PAIR_LABELS } from "@/lib/xray/common";
import {
  LESSONS,
  STALL_HINT_MS,
  lessonStageOf,
  recapLine,
  stageProgressFromFacelets,
  type HintLevel,
  type LessonStage,
  type StageRecap,
} from "@/lib/satnav/lesson";
import { StageBar } from "./StageBar";
import { useSatNavRoute } from "./useSatNavRoute";
import { cn } from "@/lib/utils/cn";

type Style = "guided" | "try";

interface Leg {
  key: string;
  stage: LessonStage;
  label?: string;
  routeTurns: number;
  startAt: number;
  turns: number;
  maxHint: HintLevel;
  pairsDone: number;
}

const legKey = (step: NavStep, stage: LessonStage) => (stage === "f2l" ? `f2l:${step.pair}` : stage);

/**
 * Sat-Nav's Learn mode: a CFOP lesson on the cube in your hands. Each leg
 * starts with what it's for and what to look for, a progress meter read
 * straight off the cube fills as you go, and each finished leg gets a
 * recap — your turns against the Sat-Nav's route. "Guided" shows one turn
 * at a time, big; "Try first" makes you work it out, with a hint ladder
 * (first turn, then the whole route) that climbs on its own if you stall.
 */
export function SatNavLesson() {
  const [style, setStyle] = useState<Style>("guided");
  const [hint, setHint] = useState<HintLevel>(0);
  const [leg, setLeg] = useState<Leg | null>(null);
  const [recaps, setRecaps] = useState<StageRecap[]>([]);
  const [finished, setFinished] = useState<{ turns: number; ms: number } | null>(null);
  const legRef = useRef<Leg | null>(null);
  const styleRef = useRef(style);
  const hintRef = useRef<HintLevel>(0);
  const stallTimer = useRef<number | null>(null);
  const solveStart = useRef<number | null>(null);
  const solveTurns = useRef(0);


  const setHintLevel = useCallback((h: HintLevel) => {
    hintRef.current = h;
    setHint(h);
    const l = legRef.current;
    if (l && h > l.maxHint) {
      l.maxHint = h;
      setLeg({ ...l });
    }
  }, []);

  const armStall = useCallback(() => {
    const arm = () => {
      if (stallTimer.current) window.clearTimeout(stallTimer.current);
      if (styleRef.current !== "try" || hintRef.current >= 2) return;
      stallTimer.current = window.setTimeout(() => {
        setHintLevel(Math.min(2, hintRef.current + 1) as HintLevel);
        arm();
      }, STALL_HINT_MS);
    };
    arm();
  }, [setHintLevel]);

  const closeLeg = useCallback((l: Leg) => {
    setRecaps((r) => [
      ...r,
      {
        stage: l.stage,
        label: l.label,
        yourTurns: l.turns,
        routeTurns: l.routeTurns,
        ms: performance.now() - l.startAt,
        hint: styleRef.current === "try" ? l.maxHint : null,
      },
    ]);
  }, []);

  const onStep = useCallback(
    (step: NavStep) => {
      const prev = legRef.current;
      if (step.stage === "solved") {
        if (prev) closeLeg(prev);
        legRef.current = null;
        setLeg(null);
        if (solveStart.current !== null) setFinished({ turns: solveTurns.current, ms: performance.now() - solveStart.current });
        solveStart.current = null;
        return;
      }
      const stage = lessonStageOf(step.stage);
      if (!stage) return;
      const key = legKey(step, stage);
      if (prev?.key === key) return;
      if (!prev) {
        // A fresh solve (or the first plan): clear the last one's recap.
        setRecaps([]);
        setFinished(null);
        solveTurns.current = 0;
      }
      const completed = prev && (prev.stage !== stage || step.pairsDone > prev.pairsDone);
      if (prev && completed) closeLeg(prev);
      const label = stage === "f2l" && step.pair !== undefined ? `${PAIR_LABELS[step.pair]} pair` : undefined;
      const next: Leg =
        prev && !completed
          ? // Switched to an easier pair mid-leg: same leg, new target.
            { ...prev, key, label }
          : { key, stage, label, routeTurns: step.turns.length, startAt: performance.now(), turns: 0, maxHint: 0, pairsDone: step.pairsDone };
      legRef.current = next;
      setLeg(next);
      if (!prev || completed) setHintLevel(0);
      armStall();
    },
    [closeLeg, armStall, setHintLevel],
  );

  const onMove = useCallback(() => {
    solveStart.current ??= performance.now();
    solveTurns.current++;
    const l = legRef.current;
    if (l) {
      l.turns++;
      setLeg({ ...l });
    }
    armStall();
  }, [armStall]);

  const { nav, replan } = useSatNavRoute({ onMove, onStep });
  const { step, status } = nav;

  const changeStyle = (next: Style) => {
    styleRef.current = next;
    setStyle(next);
    hintRef.current = 0;
    setHint(0);
    armStall();
  };
  useEffect(() => () => void (stallTimer.current && window.clearTimeout(stallTimer.current)), []);

  const live = useSmartCubeStore((s) => s.liveFacelets);
  const stage = leg?.stage ?? (step ? lessonStageOf(step.stage) : null);
  const progress = useMemo(() => (stage ? stageProgressFromFacelets(live, stage) : null), [live, stage]);
  const lesson = stage ? LESSONS[stage] : null;
  const nextDisplay = step?.display[nav.position];
  const nextTurn = step?.turns[nav.position];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between">
        <div className="flex overflow-hidden rounded-full bg-bg-panel-2 text-xs">
          {(
            [
              ["guided", "Guided"],
              ["try", "Try first"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => changeStyle(id)}
              aria-pressed={style === id}
              className={cn("px-3 py-1.5 font-medium", style === id ? "bg-accent-soft text-accent" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={replan}
          className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
        >
          <RefreshCw size={11} /> Replan
        </button>
      </div>

      <StageBar step={step} />
      <GyroTwin size={80} showControls={false} />

      {finished && (!step || step.stage === "solved") ? (
        <div className="card flex w-full flex-col items-center gap-2 rounded-xl p-5 text-center">
          <PartyPopper size={28} className="text-accent" />
          <p className="text-lg font-bold text-foreground">You solved it</p>
          <p className="text-xs text-muted">
            {finished.turns} turns in {(finished.ms / 1000).toFixed(1)}s. Scramble it and the next lesson starts on its own
            {style === "guided" ? " — try it with “Try first” on." : "."}
          </p>
        </div>
      ) : !step || status === "planning" ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 size={15} className="animate-spin text-accent" /> Reading your cube…
        </p>
      ) : step.stage === "solved" ? (
        <div className="card w-full rounded-xl p-5 text-center text-sm text-muted">Your cube is solved — scramble it to start a lesson.</div>
      ) : (
        lesson && (
          <div className="card flex w-full flex-col gap-3 rounded-xl p-4">
            <div className="flex items-start gap-2.5">
              <GraduationCap size={18} className="mt-0.5 shrink-0 text-accent" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-bold text-foreground">
                  {lesson.name}
                  {leg?.label ? ` · ${leg.label}` : ""}
                </p>
                <p className="text-xs text-foreground/90">{lesson.goal}</p>
                <p className="text-[11px] text-muted">{lesson.how}</p>
                {step.grip && <p className="text-[11px] font-medium text-accent">Hold: {step.grip}</p>}
              </div>
            </div>

            {progress && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-medium text-muted-2">
                  <span>
                    {progress.done}/{progress.total} {progress.label}
                  </span>
                  {leg && <span>{leg.turns} turns so far</span>}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg-panel-2">
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              </div>
            )}

            <div className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-lg bg-bg-panel-2/50 p-3">
              {step.stage === "lost" ? (
                <p className="text-xs text-muted">{step.title}</p>
              ) : style === "guided" ? (
                status === "recalculating" ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                    <RefreshCw size={14} className="animate-spin" /> That wasn&apos;t the planned turn — recalculating…
                  </p>
                ) : (
                  <>
                    {nextDisplay && (
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase tracking-wide text-muted-2">
                          Turn {nav.position + 1}/{step.turns.length}
                        </span>
                        <span className="flex flex-col items-center rounded-xl bg-accent px-4 py-1.5 font-mono text-4xl font-black text-accent-fg shadow-lg">
                          {nextDisplay}
                          <span className="mt-0.5 h-1.5 w-6 rounded-full ring-1 ring-black/20" style={{ background: FACELET_COLORS[nextTurn?.[0] ?? ""] }} />
                        </span>
                      </div>
                    )}
                    <RouteChips display={step.display} turns={step.turns} position={nav.position} partial={nav.partial} />
                  </>
                )
              ) : hint === 0 ? (
                <>
                  <p className="text-sm font-semibold text-foreground">Your turn — work it out.</p>
                  <p className="text-[11px] text-muted-2">Stall for {STALL_HINT_MS / 1000}s and a hint appears on its own.</p>
                </>
              ) : hint === 1 ? (
                <>
                  <p className="text-[11px] text-muted">A good next turn from here:</p>
                  {nextDisplay && (
                    <span className="rounded-xl bg-accent px-4 py-1 font-mono text-3xl font-black text-accent-fg">{nextDisplay}</span>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] text-muted">The Sat-Nav&apos;s route from here:</p>
                  <RouteChips display={step.display} turns={step.turns} position={nav.position} partial={nav.partial} />
                </>
              )}
              {style === "try" && hint < 2 && step.stage !== "lost" && (
                <button
                  type="button"
                  onClick={() => {
                    setHintLevel((hint + 1) as HintLevel);
                    armStall();
                  }}
                  className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-3 py-1 text-[11px] font-medium text-muted hover:text-foreground"
                >
                  <Lightbulb size={11} /> {hint === 0 ? "Hint: first turn" : "Show the whole route"}
                </button>
              )}
            </div>
          </div>
        )
      )}

      {recaps.length > 0 && (
        <div className="card flex w-full flex-col gap-1.5 rounded-xl p-3">
          <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">This solve</p>
          {recaps.map((r, i) => {
            // A stage's takeaway goes under its last leg (the fourth F2L pair, say), once it's really behind you.
            const lastOfStage = recaps[i + 1] ? recaps[i + 1].stage !== r.stage : !!finished || stage !== r.stage;
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <p className="flex items-start gap-1.5 text-xs text-foreground">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" />
                  {recapLine(r)}
                </p>
                {lastOfStage && <p className="pl-5 text-[11px] text-muted">{LESSONS[r.stage].takeaway}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
