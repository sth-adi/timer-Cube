"use client";

import { useEffect, useRef } from "react";
import { HOME_ORIENTATION, matToQuat, mul, quatToMat, slerpQuat, tokenMatrix, type Mat3 } from "@/lib/gyro/orientation";
import { motionIsOff } from "@/components/motion/motionOff";
import { SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { Cube3D, type Cube3DHandle } from "@/components/cube3d/Cube3D";
import { useCubeLook } from "@/components/settings/useCubeLook";

export type CalibrationPose = "home" | "y" | "yx";

/** The grip each calibration step asks for, as the twin's orientation: home, then a y from there, then an x on top of that. */
const HOME_MAT: Mat3 = HOME_ORIENTATION;
const Y_MAT: Mat3 = mul(tokenMatrix("y"), HOME_MAT);
const YX_MAT: Mat3 = mul(tokenMatrix("x"), Y_MAT);
export const POSE_MATRIX: Record<CalibrationPose, Mat3> = { home: HOME_MAT, y: Y_MAT, yx: YX_MAT };

const HOME_QUAT = matToQuat(HOME_MAT);

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
  const ref = useRef<Cube3DHandle | null>(null);
  const look = useCubeLook();
  useEffect(() => {
    const cube = ref.current;
    if (!cube) return;
    const to = matToQuat(POSE_MATRIX[pose]);
    const set = (m: Mat3) => cube.setOrientation(matToQuat(m));
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
  return <Cube3D ref={ref} size={Math.round(size * 1.9)} facelets={SOLVED_FACELETS} orientation={HOME_QUAT} look={look} />;
}
