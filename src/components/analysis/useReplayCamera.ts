"use client";

import { useEffect, useRef, type RefObject } from "react";
import { CAMERA_LATITUDE, CAMERA_LONGITUDE } from "@/components/scramble/CubeViewer";
import { solveMsAtPosition, streamQuatAt } from "@/lib/gyro/replayGyro";
import type { GyroStreamData } from "@/lib/gyro/solveGyro";
import { REST_SPRING, addLean, cameraMotionAllowed, gyroLean, leanAt, stepLean, type LeanSpring, type LeanTurn } from "@/lib/analysis/replayCamera";

/** How far up or down the replay camera may be swung (cubing.js's own default is 35). Passed to the player so the lean has room either side of the resting view. */
export const REPLAY_LATITUDE_LIMIT = 45;
/** Face lean counts for less when the recorded tilt is already moving the camera. */
const FACE_SHARE_WITH_GYRO = 0.6;
/** A drag this far (px) on the cube is the viewer orbiting it. */
const ORBIT_DRAG_PX = 6;

export interface ReplayCameraGyro {
  stream: GyroStreamData;
  /** When each move was really made, ms from the solve's start: one per replay move. */
  moveMs: readonly number[];
}

/**
 * Eases a cubing.js player's camera a few degrees toward the face being turned, and (with a recorded
 * gyro stream) after the cube's real tilt. The player reports its position about every 80 ms; between
 * reports the camera carries on from the last one at the playback rate, every animation frame, so it
 * glides rather than stepping. The lean itself is a pure function of the replay position
 * (lib/analysis/replayCamera), so scrubbing shows the same camera as playing through.
 *
 * Dragging the cube is the viewer taking the camera: from the first drag on, this never touches it again.
 */
export function useReplayCamera({
  playerRef,
  hostRef,
  active,
  turns,
  starts,
  durationMs,
  positionMs,
  playing,
  speed,
  gyro,
}: {
  playerRef: RefObject<unknown>;
  /** The element the player is mounted in: drags on it count as the viewer orbiting. */
  hostRef: RefObject<HTMLElement | null>;
  /** The player exists and has a timeline to follow. */
  active: boolean;
  turns: readonly LeanTurn[];
  /** When each move begins on the replay's clock, for mapping a position to the solve's own time. */
  starts: readonly number[];
  durationMs: number;
  positionMs: number;
  playing: boolean;
  speed: number;
  gyro?: ReplayCameraGyro | null;
}) {
  const anchorRef = useRef({ pos: positionMs, at: 0, rate: 0 });
  const kickRef = useRef<() => void>(() => {});
  const dataRef = useRef({ turns, starts, durationMs, gyro: gyro ?? null });
  const viewerOrbitedRef = useRef(false);

  useEffect(() => {
    dataRef.current = { turns, starts, durationMs, gyro: gyro ?? null };
    kickRef.current();
  });

  useEffect(() => {
    anchorRef.current = { pos: positionMs, at: performance.now(), rate: playing ? speed : 0 };
    kickRef.current();
  }, [positionMs, playing, speed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!active || !host || !cameraMotionAllowed()) return undefined;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > ORBIT_DRAG_PX) {
        viewerOrbitedRef.current = true;
        down = null;
      }
    };
    const onEnd = () => {
      down = null;
    };
    host.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);

    let spring: LeanSpring = REST_SPRING;
    let lastLat = CAMERA_LATITUDE;
    let lastLon = CAMERA_LONGITUDE;
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = 0;
      const a = anchorRef.current;
      const d = dataRef.current;
      const pos = Math.max(0, Math.min(d.durationMs, a.pos + (a.rate ? (now - a.at) * a.rate : 0)));
      let target = leanAt(d.turns, pos);
      if (d.gyro) {
        const q = streamQuatAt(d.gyro.stream, solveMsAtPosition(d.starts, d.gyro.moveMs, pos));
        target = q ? addLean(gyroLean(q), target, FACE_SHARE_WITH_GYRO) : target;
      }
      const dt = last ? Math.min(100, now - last) : 1000 / 60;
      last = now;
      const step = stepLean(spring, target, dt);
      spring = step.spring;
      if (!viewerOrbitedRef.current) {
        const model = (playerRef.current as { experimentalModel?: { twistySceneModel?: { orbitCoordinatesRequest?: { set(v: unknown): void } } } } | null)?.experimentalModel
          ?.twistySceneModel;
        const lat = Math.max(-REPLAY_LATITUDE_LIMIT, Math.min(REPLAY_LATITUDE_LIMIT, CAMERA_LATITUDE + spring.pitch));
        const lon = CAMERA_LONGITUDE + spring.yaw;
        if (model?.orbitCoordinatesRequest && (Math.abs(lat - lastLat) > 0.01 || Math.abs(lon - lastLon) > 0.01)) {
          lastLat = lat;
          lastLon = lon;
          model.orbitCoordinatesRequest.set({ latitude: lat, longitude: lon });
        }
        if (a.rate > 0 || !step.settled) raf = requestAnimationFrame(frame);
        else last = 0;
      }
    };
    kickRef.current = () => {
      if (!raf && !viewerOrbitedRef.current) raf = requestAnimationFrame(frame);
    };
    kickRef.current();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      kickRef.current = () => {};
      host.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [active, hostRef, playerRef]);
}
