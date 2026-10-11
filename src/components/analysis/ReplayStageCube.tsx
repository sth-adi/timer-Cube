"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Cube3D } from "@/components/cube3d/Cube3D";
import { useCubeLook } from "@/components/settings/useCubeLook";
import type { TurnState } from "@/components/lab/TurnCube";
import { REST_JIGGLE, buildJiggleEvents, rattleAt, wobbleAt, type CubeJiggle } from "@/lib/cube3d/jiggle";
import { quatToMat, type Quat } from "@/lib/gyro/orientation";
import { solveMsAtPosition, streamQuatAt } from "@/lib/gyro/replayGyro";
import type { GyroStreamData } from "@/lib/gyro/solveGyro";
import { springStep, type SpringPose } from "@/lib/gyro/smooth";
import { REST_SPRING, buildLeanTurns, cameraMotionAllowed, leanAt, stepLean, type LeanSpring } from "@/lib/analysis/replayCamera";
import { activeLeaf, type ReplayTimeline } from "@/lib/analysis/replayTiming";
import { FIXED_VIEW, halfwayFacelets, stageStateAt, viewOrientation } from "@/lib/analysis/replayView";

/** Degrees of turn per pixel of drag. */
const ORBIT_DEG_PER_PX = 0.45;
const ORBIT_DRAG_PX = 4;
const DOUBLE_TAP_MS = 320;

interface View {
  facelets: string;
  turning: TurnState | null;
  orientation: Quat;
  jiggle: CubeJiggle | null;
}

export interface StageClock {
  now(): number;
  readonly playing: boolean;
}

/** How long move `k` takes on screen: its time on the replay's clock (a double played as two quarters: the mean of the two) over the playback speed. */
function turnScreenMs(d: { starts: readonly number[]; ends: readonly number[]; halves?: ReplayTimeline["halves"]; speed: number }, k: number): number | undefined {
  const h = d.halves?.[k];
  const ms = h ? (h.firstEnd - h.firstStart + (h.secondEnd - h.secondStart)) / 2 : (d.ends[k] ?? 0) - (d.starts[k] ?? 0);
  const speed = d.speed > 0 ? d.speed : 1;
  return ms > 0 ? ms / speed : undefined;
}

/**
 * The replay's main cube: Cube3D driven frame by frame from the replay's clock. Everything drawn is a pure
 * function of the position, so scrubbing shows the exact state there (the cube after the moves before it, plus
 * the turn in progress). With a recorded gyro stream the cube tilts and regrips exactly as the real one did
 * (smoothed through the same spring as the Gyro Twin); without one it holds a fixed three-quarter view. In both the
 * camera leans a few degrees toward the face being turned (lib/analysis/replayCamera). Dragging orbits it a little;
 * a double tap puts it back.
 *
 * `faceletsAfter[k]` is the cube with the first k moves made; `starts`/`ends` are when each move begins and ends
 * on the replay's clock; `moveMs` is when each was really made (only with a gyro stream). `onTurn` is called as
 * playback enters a move (never while paused or scrubbing).
 */
export function ReplayStageCube({
  clock,
  faceletsAfter,
  tokens,
  starts,
  ends,
  halves,
  stream,
  moveMs,
  positionMs,
  playing,
  speed,
  onTurn,
  onReady,
}: {
  clock: StageClock;
  faceletsAfter: readonly string[];
  tokens: readonly string[];
  starts: readonly number[];
  ends: readonly number[];
  /** A double turn played as its two real quarter turns (see ReplayTimeline.halves); omit for each move as one turn. */
  halves?: ReplayTimeline["halves"];
  stream?: GyroStreamData | null;
  moveMs?: readonly number[] | null;
  /** The player's last reported position and state: they wake the frame loop (a scrub while paused, a speed change). */
  positionMs: number;
  playing: boolean;
  speed: number;
  onTurn?: (k: number, part?: 0 | 1) => void;
  /** The first frame is drawn (three.js loads lazily, so the stage shows its placeholder until then). */
  onReady?: () => void;
}) {
  const look = useCubeLook();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>(() => ({ facelets: faceletsAfter[0], turning: null, orientation: FIXED_VIEW, jiggle: null }));
  const kickRef = useRef<() => void>(() => {});
  const orbitRef = useRef({ yaw: 0, pitch: 0 });
  const dataRef = useRef({ clock, faceletsAfter, tokens, starts, ends, halves, stream, moveMs, speed, onTurn, onReady });
  useEffect(() => {
    dataRef.current = { clock, faceletsAfter, tokens, starts, ends, halves, stream, moveMs, speed, onTurn, onReady };
    kickRef.current();
  });
  useEffect(() => {
    kickRef.current();
  }, [positionMs, playing, speed]);

  useEffect(() => {
    const reduce = !cameraMotionAllowed();
    let spring: LeanSpring = REST_SPRING;
    let pose: SpringPose | null = null;
    let raf = 0;
    let last = 0;
    let prevPos = dataRef.current.clock.now();
    let lastKey = "";
    let turnsKey = "";
    let turns: ReturnType<typeof buildLeanTurns> = [];
    let jiggleEvents: ReturnType<typeof buildJiggleEvents> = [];
    // Wobble is shown while playing and eased out when paused, so a pause never leaves the cube crooked; it is a pure function of the position.
    let jiggleGain = 0;
    let halfOf = new Map<number, string>();
    let halfFor: readonly string[] | null = null;
    const frame = (now: number) => {
      raf = 0;
      const d = dataRef.current;
      // The scrubber's last notch can sit a fraction short of the end (its max isn't a whole number): that is the end.
      const raw = d.clock.now();
      const endMs = d.ends.length ? d.ends[d.ends.length - 1] : 0;
      const pos = endMs > 0 && raw >= endMs - 1 ? endMs : raw;
      const running = d.clock.playing;
      // Lean turns follow the timeline (they change when "Real pauses" is switched).
      const key = `${d.starts.length}:${d.starts[d.starts.length - 1] ?? 0}`;
      if (key !== turnsKey) {
        turnsKey = key;
        turns = buildLeanTurns(d.tokens, d.starts, d.ends);
        jiggleEvents = buildJiggleEvents(d.tokens, d.starts, d.ends, d.halves);
      }
      const dt = last ? Math.min(100, now - last) : 1000 / 60;
      last = now;

      // Sound: a move entered since the last frame, only while really playing (never on a scrub or a seek).
      if (running && pos >= prevPos) {
        const from = activeLeaf(d.starts, prevPos);
        const to = activeLeaf(d.starts, pos);
        if (to > from && pos - prevPos < 400) d.onTurn?.(to);
        // A double turn clicks twice: once per quarter, the second as playback crosses into its window.
        const h = d.halves?.[to];
        if (h && pos - prevPos < 400 && prevPos < h.secondStart && h.secondStart < pos) d.onTurn?.(to, 1);
      }
      prevPos = pos;

      let settled = true;
      let base: Quat = FIXED_VIEW;
      const target = d.stream && d.moveMs ? streamQuatAt(d.stream, solveMsAtPosition(d.starts, d.moveMs, pos)) : null;
      if (target) {
        if (!pose || reduce) pose = { q: target, w: [0, 0, 0] };
        else {
          const next = springStep(pose, target, dt);
          pose = next;
          settled = next.settled;
        }
        base = pose.q;
      }
      if (!reduce) {
        const step = stepLean(spring, leanAt(turns, pos, target ? quatToMat(base) : undefined), dt);
        spring = step.spring;
        settled = settled && step.settled;
      }

      if (halfFor !== d.faceletsAfter) {
        halfFor = d.faceletsAfter;
        halfOf = new Map();
      }
      const state = stageStateAt({
        tokens: d.tokens,
        starts: d.starts,
        ends: d.ends,
        halves: d.halves,
        faceletsAfter: d.faceletsAfter,
        pos,
        halfway: (i) => {
          let f = halfOf.get(i);
          if (f === undefined) {
            f = halfwayFacelets(d.faceletsAfter[i], d.tokens[i] ?? "");
            halfOf.set(i, f);
          }
          return f;
        },
      });
      const { k, facelets } = state;
      // How long the turn in flight takes on screen (the replay's own time for it over the playback speed): the 3D cube sizes its motion blur from it.
      const turning = state.turning ? { ...state.turning, turnMs: turnScreenMs(d, k) } : null;
      const progress = turning ? turning.progress : 1;
      const orientation = viewOrientation(base, spring, orbitRef.current);
      let jiggle: CubeJiggle | null = null;
      if (!reduce) {
        jiggleGain += ((running ? 1 : 0) - jiggleGain) * Math.min(1, dt / 90);
        if (!running && jiggleGain < 0.002) jiggleGain = 0;
        else if (jiggleGain > 0) settled = settled && running;
        const w = jiggleGain > 0 ? wobbleAt(jiggleEvents, pos, Math.max(0.25, Math.min(2, d.speed))) : null;
        const timeScale = Math.max(0.25, Math.min(2, d.speed));
        jiggle = w ? { wobble: [w[0] * jiggleGain, w[1] * jiggleGain, w[2] * jiggleGain], rattle: rattleAt(jiggleEvents, pos, timeScale, jiggleGain) } : REST_JIGGLE;
      }
      const sig = `${facelets}|${turning ? `${k}:${progress.toFixed(4)}` : ""}|${orientation.x.toFixed(5)},${orientation.y.toFixed(5)},${orientation.z.toFixed(5)},${orientation.w.toFixed(5)}|${jiggle ? jiggle.wobble.map((v) => v.toFixed(5)).join(",") : ""}|${jiggle?.rattle ? `${jiggle.rattle.ageMs.toFixed(1)}:${jiggle.rattle.strength.toFixed(3)}` : ""}`;
      if (sig !== lastKey) {
        lastKey = sig;
        setView({ facelets, turning, orientation, jiggle });
      }
      if (running || !settled) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    kickRef.current = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    kickRef.current();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      kickRef.current = () => {};
    };
  }, []);

  // The first drawn frame: Cube3D flags its mode once three.js is up (or has fallen back to CSS), one frame later it is on screen.
  useEffect(() => {
    const box = boxRef.current;
    const el = box?.querySelector<HTMLElement>('[data-testid="cube3d"]');
    if (!el) return undefined;
    let done = false;
    let raf = 0;
    const check = () => {
      if (done || el.dataset.mode === "loading") return;
      done = true;
      raf = requestAnimationFrame(() => raf = requestAnimationFrame(() => dataRef.current.onReady?.()));
    };
    const mo = new MutationObserver(check);
    mo.observe(el, { attributes: true, attributeFilter: ["data-mode"] });
    check();
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Drag to orbit, double tap to reset.
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const lastTapRef = useRef(0);
  const onPointerDown = (e: ReactPointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable (synthetic event): the drag still works while the pointer stays over the cube.
    }
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = dragRef.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < ORBIT_DRAG_PX) return;
    g.moved = true;
    g.x = e.clientX;
    g.y = e.clientY;
    const o = orbitRef.current;
    orbitRef.current = { yaw: o.yaw + dx * ORBIT_DEG_PER_PX, pitch: Math.max(-60, Math.min(60, o.pitch + dy * ORBIT_DEG_PER_PX)) };
    kickRef.current();
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const g = dragRef.current;
    dragRef.current = null;
    if (!g || g.moved) return;
    const t = e.timeStamp;
    if (t - lastTapRef.current < DOUBLE_TAP_MS) {
      orbitRef.current = { yaw: 0, pitch: 0 };
      lastTapRef.current = 0;
      kickRef.current();
    } else lastTapRef.current = t;
  };

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 flex items-start justify-center"
      style={{ paddingTop: "1%", touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (dragRef.current = null)}
      data-testid={stream ? "replay-gyro-twin" : "replay-main-cube"}
      data-facelets={view.facelets}
      data-turning={view.turning ? "true" : "false"}
      // Test hook: [move, firstStart, firstEnd, secondStart, secondEnd] for every double played as two quarter turns.
      data-halves={halves?.some(Boolean) ? JSON.stringify(halves.flatMap((h, i) => (h ? [[i, h.firstStart, h.firstEnd, h.secondStart, h.secondEnd]] : []))) : undefined}
    >
      {/* The box is 78% of the stage's width: the cube itself then fills about 56% of it. */}
      <Cube3D look={look} facelets={view.facelets} turning={view.turning} orientation={view.orientation} jiggle={view.jiggle} className="h-[78cqw] w-[78cqw] shrink-0" />
    </div>
  );
}
