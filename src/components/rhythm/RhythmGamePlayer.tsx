"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildRhythmTrack,
  judgeHit,
  applyHit,
  initialScoreState,
  gradeFor,
  HIT_WINDOW_MS,
  type RhythmScoreState,
  type HitJudgement,
} from "@/lib/analysis/rhythmGame";
import { cn } from "@/lib/utils/cn";

/** Ms a note is visible before it's due — how far up the lane it starts falling from. Must match rhythm-fall's -220px travel distance in globals.css closely enough to look right; not load-bearing for correctness since scoring is purely time-based. */
const LOOKAHEAD_MS = 1600;

const JUDGEMENT_COLOR: Record<HitJudgement, string> = {
  perfect: "text-success",
  good: "text-warning",
  miss: "text-danger",
};

type Phase = "ready" | "playing" | "done";

interface RhythmGamePlayerProps {
  reconstruction: string;
  moveTimestamps?: number[];
}

/**
 * The playable rhythm-game view for one solve's real move timing (see
 * lib/analysis/rhythmGame.ts for how a solve becomes a chart). Falling notes
 * are pure CSS animation (each note's own `animation-delay`, computed once
 * from its known due time) so there's no per-frame JS repositioning loop —
 * only a light rAF loop to auto-miss any note whose window closes with no
 * key press, and a keydown listener to judge a press against whichever note
 * is next due.
 */
export function RhythmGamePlayer({ reconstruction, moveTimestamps }: RhythmGamePlayerProps) {
  const track = useMemo(() => buildRhythmTrack(reconstruction, moveTimestamps), [reconstruction, moveTimestamps]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState<RhythmScoreState>(initialScoreState());
  const [flash, setFlash] = useState<HitJudgement | null>(null);
  const noteIndexRef = useRef(0);
  const startTimeRef = useRef(0);

  const start = useCallback(() => {
    noteIndexRef.current = 0;
    setScore(initialScoreState());
    setFlash(null);
    startTimeRef.current = performance.now();
    setPhase("playing");
  }, []);

  // Auto-miss loop: advances past any note whose good-window has closed with
  // no input, and ends the run once every note has been resolved one way or
  // another.
  useEffect(() => {
    if (phase !== "playing") return;
    let raf: number;
    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      let missedAny = false;
      while (noteIndexRef.current < track.notes.length && elapsed > track.notes[noteIndexRef.current].hitAtMs + HIT_WINDOW_MS.good) {
        setScore((s) => applyHit(s, "miss"));
        noteIndexRef.current += 1;
        missedAny = true;
      }
      if (missedAny) setFlash("miss");
      if (noteIndexRef.current >= track.notes.length) {
        setPhase("done");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, track.notes]);

  const handleHit = useCallback(() => {
    if (phase !== "playing" || noteIndexRef.current >= track.notes.length) return;
    const elapsed = performance.now() - startTimeRef.current;
    const judgement = judgeHit(track.notes[noteIndexRef.current], elapsed);
    setScore((s) => applyHit(s, judgement));
    setFlash(judgement);
    noteIndexRef.current += 1;
  }, [phase, track.notes]);

  useEffect(() => {
    if (phase !== "playing") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      e.preventDefault();
      handleHit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, handleHit]);

  useEffect(() => {
    if (flash === null) return;
    const id = window.setTimeout(() => setFlash(null), 350);
    return () => window.clearTimeout(id);
  }, [flash]);

  if (track.notes.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">This solve has no reconstruction to build a track from.</p>;
  }

  if (phase === "ready") {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <p className="text-center text-sm text-muted">
          {track.notes.length} moves · {track.hasRealTiming ? "your real solve timing" : "estimated pacing — no smart-cube timing on this solve"}
        </p>
        <p className="max-w-xs text-center text-xs text-muted-2">Tap or press any key exactly when each move lands on the line.</p>
        <button type="button" onClick={start} className="tap-target rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-fg">
          Start
        </button>
      </div>
    );
  }

  if (phase === "done") {
    const grade = gradeFor(score, track.notes.length);
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="text-7xl font-bold text-accent">{grade}</p>
        <p className="text-sm text-muted">
          {score.perfects} perfect · {score.goods} good · {score.misses} miss
        </p>
        <p className="text-xs text-muted-2">
          Score {score.score} · Max combo {score.maxCombo}
        </p>
        <button type="button" onClick={start} className="tap-target mt-2 rounded-full bg-bg-panel-2 px-5 py-2 text-sm font-medium text-foreground">
          Play again
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-72 w-full touch-none select-none overflow-hidden rounded-xl bg-bg-panel-2" onPointerDown={handleHit}>
      <div className="absolute inset-x-0 bottom-10 h-0.5 bg-accent/70" />
      {track.notes.map((note) => (
        <div
          key={note.index}
          className="absolute left-1/2 flex h-9 w-9 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-accent-fg"
          style={{
            top: 230,
            marginLeft: -18,
            animationName: "rhythm-fall",
            animationDuration: `${LOOKAHEAD_MS}ms`,
            animationTimingFunction: "linear",
            animationFillMode: "both",
            animationDelay: `${note.hitAtMs - LOOKAHEAD_MS}ms`,
          }}
        >
          {note.token}
        </div>
      ))}
      {flash && (
        <p className={cn("pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 text-sm font-bold", JUDGEMENT_COLOR[flash])}>
          {flash.toUpperCase()}
        </p>
      )}
      <div className="absolute right-3 top-3 text-right">
        <p className="text-sm font-bold text-foreground">{score.score}</p>
        <p className="text-[10px] text-muted-2">combo {score.combo}</p>
      </div>
    </div>
  );
}
