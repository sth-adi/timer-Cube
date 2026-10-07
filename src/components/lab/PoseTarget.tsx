"use client";

import { useEffect, useRef } from "react";
import { HOME_ORIENTATION, cssMatrix3d, matToQuat, mul, quatToMat, slerpQuat, tokenMatrix, type Mat3 } from "@/lib/gyro/orientation";
import { motionIsOff } from "@/components/motion/motionOff";
import { SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { GYRO_TWIN_CAMERA } from "./GyroTwin";
import { TurnCube } from "./TurnCube";
import { TwinStage } from "./TwinStage";

export type CalibrationPose = "home" | "y" | "yx";

/** The grip each calibration step asks for, as the twin's orientation: home, then a y from there, then an x on top of that. */
const HOME_MAT: Mat3 = HOME_ORIENTATION;
const Y_MAT: Mat3 = mul(tokenMatrix("y"), HOME_MAT);
const YX_MAT: Mat3 = mul(tokenMatrix("x"), Y_MAT);
export const POSE_MATRIX: Record<CalibrationPose, Mat3> = { home: HOME_MAT, y: Y_MAT, yx: YX_MAT };

/** The pose before each one (the first starts at home). */
const PREVIOUS: Record<CalibrationPose, CalibrationPose> = { home: "home", y: "home", yx: "y" };

/** A beat at the old pose, then the turn itself. */
const HOLD_MS = 350;
const TURN_MS = 900;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * A still cube in the grip a calibration step wants, so "hold this" can be seen next to the live twin. When the
 * step changes it first shows the previous grip and then turns into the new one (the y, the x) so the move
 * itself is shown, not just its result; with reduced motion or effects off it just shows the new grip.
 */
export function PoseTarget({ pose, size }: { pose: CalibrationPose; size: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const to = matToQuat(POSE_MATRIX[pose]);
    const set = (m: Mat3) => {
      el.style.transform = `${GYRO_TWIN_CAMERA} ${cssMatrix3d(m)}`;
    };
    if (motionIsOff() || pose === "home") {
      set(POSE_MATRIX[pose]);
      return;
    }
    const from = matToQuat(POSE_MATRIX[PREVIOUS[pose]]);
    set(POSE_MATRIX[PREVIOUS[pose]]);
    let raf = 0;
    let start = 0;
    const frame = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, Math.max(0, (now - start - HOLD_MS) / TURN_MS));
      set(quatToMat(slerpQuat(from, to, easeInOut(t))));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pose]);
  return (
    <TwinStage size={size}>
      <div
        ref={ref}
        className="relative"
        style={{ width: size, height: size, transformStyle: "preserve-3d", transform: `${GYRO_TWIN_CAMERA} ${cssMatrix3d(HOME_MAT)}` }}
      >
        <TurnCube facelets={SOLVED_FACELETS} turning={null} size={size} />
      </div>
    </TwinStage>
  );
}
