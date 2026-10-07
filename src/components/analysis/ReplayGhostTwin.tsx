"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GYRO_TWIN_CAMERA } from "@/components/lab/GyroTwin";
import { TurnCube } from "@/components/lab/TurnCube";
import { TwinStage } from "@/components/lab/TwinStage";
import { parseMove } from "@/lib/cube-engine/stickerTurns";
import { HOME_ORIENTATION, cssMatrix3d } from "@/lib/gyro/orientation";
import { faceletsAfterMoves } from "@/lib/gyro/replayGyro";
import type { Ghost } from "@/lib/rematch/ghost";
import { REST_SPRING, buildLeanTurns, cameraMotionAllowed, leanAt, stepLean, type LeanSpring } from "@/lib/analysis/replayCamera";
import { ghostFrameAt, ghostTimeline } from "@/lib/analysis/replayGhost";
import { remapPosition, type ReplayTimeline } from "@/lib/analysis/replayTiming";

/** The twin's camera, nudged by a lean (degrees) the way the Gyro Twin's fixed camera is: yaw swings it right, pitch raises it. */
const cameraFor = (yaw: number, pitch: number) => `rotateX(${(-24 - pitch).toFixed(2)}deg) rotateY(${(-32 - yaw).toFixed(2)}deg)`;
const GRIP = cssMatrix3d(HOME_ORIENTATION);

/**
 * A second, faint cube turning beside yours at the same elapsed time: your best earlier solve (or a model
 * solution) playing its own scramble from its own first move, in the grip the replay shows (yellow top,
 * green front). It is drawn by TurnCube, so its layers really turn, and its camera leans toward its own
 * turns the way the replay's does.
 *
 * `shown` is the timeline the replay's scrubber runs on and `real` the same moves at their true timing;
 * the ghost runs on true timing, so the replay's position is mapped onto `real` first (they are the same
 * thing unless long pauses are shortened). Like ReplayGyroTwin it keeps its own frame clock between the
 * player's ~80 ms reports.
 */
export function ReplayGhostTwin({
  ghost,
  caption,
  shown,
  real,
  positionMs,
  playing,
  speed,
  turnMs,
  size = 56,
}: {
  ghost: Ghost;
  caption: string;
  shown: ReplayTimeline;
  real: ReplayTimeline;
  positionMs: number;
  playing: boolean;
  speed: number;
  /** Length of one turn's animation, as the replay's own (shorter under reduced motion). */
  turnMs: number;
  size?: number;
}) {
  const orientRef = useRef<HTMLDivElement | null>(null);
  const timeline = useMemo(() => ghostTimeline(ghost, turnMs), [ghost, turnMs]);
  const faceletsAfter = useMemo(() => faceletsAfterMoves(ghost.scramble, ghost.moves), [ghost]);
  const turns = useMemo(() => buildLeanTurns(ghost.moves, timeline.starts, timeline.ends), [ghost, timeline]);
  const [clock, setClock] = useState(0);
  const clockRef = useRef(0);
  const anchorRef = useRef({ pos: positionMs, at: 0, rate: 0 });
  const kickRef = useRef<() => void>(() => {});
  const dataRef = useRef({ shown, real, turns });

  useEffect(() => {
    dataRef.current = { shown, real, turns };
    kickRef.current();
  });

  useEffect(() => {
    anchorRef.current = { pos: positionMs, at: performance.now(), rate: playing ? speed : 0 };
    kickRef.current();
  }, [positionMs, playing, speed]);

  useEffect(() => {
    const el = orientRef.current;
    if (!el) return undefined;
    const lean = cameraMotionAllowed();
    let spring: LeanSpring = REST_SPRING;
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = 0;
      const a = anchorRef.current;
      const d = dataRef.current;
      const shownPos = Math.max(0, Math.min(d.shown.durationMs, a.pos + (a.rate ? (now - a.at) * a.rate : 0)));
      const pos = d.shown === d.real ? shownPos : remapPosition(shownPos, d.shown, d.real);
      let settled = true;
      if (lean) {
        const dt = last ? Math.min(100, now - last) : 1000 / 60;
        last = now;
        const step = stepLean(spring, leanAt(d.turns, pos, HOME_ORIENTATION), dt);
        spring = step.spring;
        settled = step.settled;
        el.style.transform = `${cameraFor(spring.yaw, spring.pitch)} ${GRIP}`;
      }
      if (Math.abs(pos - clockRef.current) > 0.5) {
        clockRef.current = pos;
        setClock(pos);
      }
      if (a.rate > 0 && shownPos < d.shown.durationMs) raf = requestAnimationFrame(frame);
      else if (!settled) raf = requestAnimationFrame(frame);
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

  const frame = ghostFrameAt(timeline, clock);
  const turn = frame.turning ? parseMove(ghost.moves[frame.turning.index] ?? "") : null;
  const turning = turn && frame.turning ? { turn, progress: frame.turning.progress } : null;
  const facelets = faceletsAfter?.[turning && frame.turning ? frame.turning.index : frame.done];
  if (!facelets) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-bg-panel/70 p-1" aria-hidden="true" data-testid="replay-ghost-twin">
      <div className="opacity-60">
        <TwinStage size={size} box={1.55} drop={0.8}>
          <div
            ref={orientRef}
            className="relative"
            style={{
              width: size,
              height: size,
              transformStyle: "preserve-3d",
              // The camera and grip are written by the frame loop, never by a style prop: a re-render would set them back.
              transform: `${GYRO_TWIN_CAMERA} ${GRIP}`,
            }}
          >
            <TurnCube facelets={facelets} turning={turning} size={size} />
          </div>
        </TwinStage>
      </div>
      <span className="max-w-[7rem] truncate text-[9px] font-medium uppercase tracking-wide text-muted-2">{frame.finished ? `${caption} done` : caption}</span>
    </div>
  );
}
