"use client";

import { useEffect, useRef, useState } from "react";
import { GYRO_TWIN_CAMERA } from "@/components/lab/GyroTwin";
import { TurnCube } from "@/components/lab/TurnCube";
import { TwinStage } from "@/components/lab/TwinStage";
import { parseTurn } from "@/lib/cube-engine/stickerTurns";
import { cssMatrix3d, quatToMat } from "@/lib/gyro/orientation";
import { solveMsAtPosition, streamQuatAt } from "@/lib/gyro/replayGyro";
import type { GyroStreamData } from "@/lib/gyro/solveGyro";
import { springStep, type SpringPose } from "@/lib/gyro/smooth";
import { activeLeaf } from "@/lib/analysis/replayTiming";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The Gyro Twin as it was in a recorded solve: a small 3D cube, tilted as the real cube was tilted
 * at this moment of the replay and showing the stickers it had then. Drawn over the replay's cube,
 * so a regrip or a tilt mid-solve can be seen alongside the turns.
 *
 * The replay player reports its position about every 80 ms, which would move the twin in 12 fps steps, so
 * the twin keeps its own clock: between reports it carries on from the last one at the playback rate
 * (every animation frame), and its tilt is a spring toward the recorded orientation so it glides through
 * the stream's ~20 Hz samples. The turning layer is drawn by how far through its move that clock is.
 *
 * `faceletsAfter[k]` is the cube with the first k moves made (so one more entry than there are
 * moves); `moveMs` is when each move was really made, ms from the solve's start; `starts` and `ends`
 * are when each begins and finishes on the replay's own clock.
 */
export function ReplayGyroTwin({
  stream,
  faceletsAfter,
  moveMs,
  starts,
  ends,
  moves,
  positionMs,
  playing,
  speed,
  size = 48,
}: {
  stream: GyroStreamData;
  faceletsAfter: readonly string[];
  moveMs: readonly number[];
  starts: readonly number[];
  ends: readonly number[];
  /** The tokens the replay plays, one per entry of `starts`. */
  moves: readonly string[];
  /** The player's last reported position on the replay's own clock. */
  positionMs: number;
  playing: boolean;
  /** Playback rate (1 = real time). */
  speed: number;
  size?: number;
}) {
  const orientRef = useRef<HTMLDivElement | null>(null);
  const [clock, setClock] = useState(positionMs);
  const clockRef = useRef(positionMs);
  // The last report and when it arrived; the frame loop extrapolates from it.
  const anchorRef = useRef({ pos: positionMs, at: 0, rate: 0 });
  const poseRef = useRef<SpringPose | null>(null);
  const kickRef = useRef<() => void>(() => {});
  // Everything the frame loop reads, kept current without restarting it.
  const dataRef = useRef({ stream, moveMs, starts, ends });

  useEffect(() => {
    dataRef.current = { stream, moveMs, starts, ends };
  });

  useEffect(() => {
    anchorRef.current = { pos: positionMs, at: performance.now(), rate: playing ? speed : 0 };
    kickRef.current();
  }, [positionMs, playing, speed]);

  useEffect(() => {
    const el = orientRef.current;
    if (!el) return undefined;
    const reduce = prefersReducedMotion();
    const start = streamQuatAt(dataRef.current.stream, solveMsAtPosition(dataRef.current.starts, dataRef.current.moveMs, anchorRef.current.pos));
    if (start) {
      poseRef.current = { q: start, w: [0, 0, 0] };
      el.style.transform = `${GYRO_TWIN_CAMERA} ${cssMatrix3d(quatToMat(start))}`;
    }
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = 0;
      const a = anchorRef.current;
      const { stream: st, moveMs: mm, starts: ss, ends: es } = dataRef.current;
      const end = es.length ? es[es.length - 1] : 0;
      const pos = Math.max(0, Math.min(end, a.pos + (a.rate ? (now - a.at) * a.rate : 0)));
      const target = streamQuatAt(st, solveMsAtPosition(ss, mm, pos));
      let settled = true;
      if (target) {
        const dt = last ? Math.min(100, now - last) : 1000 / 60;
        last = now;
        const prev = poseRef.current;
        if (!prev || reduce) {
          poseRef.current = { q: target, w: [0, 0, 0] };
        } else {
          const next = springStep(prev, target, dt);
          poseRef.current = next;
          settled = next.settled;
        }
        el.style.transform = `${GYRO_TWIN_CAMERA} ${cssMatrix3d(quatToMat(poseRef.current.q))}`;
      }
      if (Math.abs(pos - clockRef.current) > 0.5) {
        clockRef.current = pos;
        setClock(pos);
      }
      if (a.rate > 0 && pos < end) raf = requestAnimationFrame(frame);
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

  // The turn in progress: the cube before it, plus how far round the layer is. Finished (or not a face turn) shows the result.
  const k = starts.length ? activeLeaf(starts, clock) : -1;
  const turn = k >= 0 ? parseTurn(moves[k] ?? "") : null;
  const span = k >= 0 ? (ends[k] ?? 0) - (starts[k] ?? 0) : 0;
  const progress = turn && span > 0 ? (clock - starts[k]) / span : 1;
  const turning = turn && progress < 1 ? { turn, progress: Math.max(0, progress) } : null;
  const facelets = turning ? faceletsAfter[k] : faceletsAfter[Math.min(faceletsAfter.length - 1, Math.max(0, k + 1))];
  if (!facelets) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-bg-panel/60 p-1 backdrop-blur-sm" aria-hidden="true" data-testid="replay-gyro-twin">
      <TwinStage size={size} box={1.7} drop={0.8}>
        <div
          ref={orientRef}
          className="relative"
          style={{
            width: size,
            height: size,
            transformStyle: "preserve-3d",
            // The tilt is written by the frame loop, never by a style prop: a re-render would set it back.
          }}
        >
          <TurnCube facelets={facelets} turning={turning} size={size} />
        </div>
      </TwinStage>
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-2">Gyro</span>
    </div>
  );
}
