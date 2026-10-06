"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crosshair } from "lucide-react";
import { subscribeGyro } from "@/lib/store/smartCubeBus";
import { calibrationFor, useGyroStore } from "@/lib/store/gyroStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { HOME_ORIENTATION, RotationTracker, cssMatrix3d, matToQuat, orientationLabel, quatToMat, type Quat } from "@/lib/gyro/orientation";
import { stepToward } from "@/lib/gyro/smooth";
import { TurnCube } from "./TurnCube";
import { useTurnAnimation } from "./useTurnAnimation";
import { cn } from "@/lib/utils/cn";

/** A fixed camera slightly above and to the right, so at any orientation you see three faces — like looking down at the cube in your own hands. */
export const GYRO_TWIN_CAMERA = "rotateX(-24deg) rotateY(-32deg)";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

interface GyroTwinProps {
  size?: number;
  className?: string;
  /** Show the orientation readout, last rotation, and Re-center button under the cube. */
  showControls?: boolean;
  /** Where the viewer is, as a CSS rotation — defaults to looking down at the cube in your own hands. */
  camera?: string;
  /** Fires every time a whole-cube rotation settles — lets a caller (e.g. a live regrip tally) count them without duplicating the tracker. */
  onRotation?: (token: string) => void;
  /**
   * Hides every link that would navigate away. The live timer passes it while a solve is armed or
   * recording: a stray tap on a 10px link must not unmount the timer with the clock running.
   */
  navLocked?: boolean;
}

/**
 * The Gyro Twin: a live 3D copy of the physical cube in your hands — every
 * sticker from the move stream, and its real-world orientation from the
 * cube's own IMU, so tilting the cube tilts the twin. Built from plain CSS
 * 3D faces (like CubeLookaheadIcon) rather than a WebGL scene; orientation
 * updates go straight to the DOM via a ref, never through React state. The
 * cube streams its pose at ~20-30 Hz, so the drawn pose chases the latest
 * sample each frame (see lib/gyro/smooth) instead of stepping to it, and the
 * loop stops when it arrives. When a turn changes the stickers, the ones that
 * changed colour get a quick brightness pulse so a turn reads as motion.
 *
 * Also runs a live RotationTracker so whole-cube rotations get named the
 * instant they settle ("y", "x'"…) — the same detector that writes them into
 * rotation-aware reconstructions after a solve.
 */
export function GyroTwin({ size = 120, className, showControls = true, camera = GYRO_TWIN_CAMERA, onRotation, navLocked = false }: GyroTwinProps) {
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const facelets = useSmartCubeStore((s) => s.liveFacelets);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);
  const protocolName = useSmartCubeStore((s) => s.protocolName);
  const gyroNeedsRecenter = useSmartCubeStore((s) => s.gyroNeedsRecenter);
  const recenterGyro = useSmartCubeStore((s) => s.recenterGyro);
  const ref = useGyroStore((s) => s.ref);
  // Re-read on calibration changes so a freshly saved calibration applies immediately.
  const calibrations = useSettingsStore((s) => s.gyroCalibrations);
  const [label, setLabel] = useState(orientationLabel(HOME_ORIENTATION));
  const [lastRotation, setLastRotation] = useState<{ token: string; id: number } | null>(null);
  // Kept in a ref (not an effect dependency) so a caller passing a fresh
  // inline callback each render — e.g. SmartCubeTimer's live regrip tally —
  // never forces the tracker below to tear down and resubscribe.
  const onRotationRef = useRef(onRotation);
  useEffect(() => {
    onRotationRef.current = onRotation;
  });

  useEffect(() => {
    const el = cubeRef.current;
    if (!el) return;
    el.style.transform = `${camera} ${cssMatrix3d(HOME_ORIENTATION)}`;
    if (!ref) return;
    const { calibration } = calibrationFor(protocolName);
    const tracker = new RotationTracker(ref, calibration);
    // The pose being drawn chases the latest sample; both are quaternions so
    // the chase is a plain slerp. With reduced motion it just snaps.
    let drawn: Quat | null = null;
    let target: Quat | null = null;
    let raf = 0;
    let lastFrameAt = 0;
    let rotationId = 0;
    const reduceMotion = prefersReducedMotion();
    const frame = (now: number) => {
      raf = 0;
      if (!target) return;
      const dt = lastFrameAt ? Math.min(100, now - lastFrameAt) : 1000 / 60;
      lastFrameAt = now;
      const step = drawn && !reduceMotion ? stepToward(drawn, target, dt) : { q: target, settled: true };
      drawn = step.q;
      el.style.transform = `${camera} ${cssMatrix3d(quatToMat(drawn))}`;
      if (step.settled) lastFrameAt = 0;
      else raf = requestAnimationFrame(frame);
    };
    const unsubscribe = subscribeGyro((sample) => {
      const out = tracker.push(sample);
      target = matToQuat(out.orientation);
      if (!raf) raf = requestAnimationFrame(frame);
      if (out.segment) setLabel(orientationLabel(out.segment.orientation));
      if (out.rotation) {
        setLastRotation({ token: out.rotation.token, id: ++rotationId });
        onRotationRef.current?.(out.rotation.token);
      }
    });
    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, protocolName, calibrations, camera]);

  // Each turn the cube reports plays as that layer turning; anything bigger just snaps.
  const turnView = useTurnAnimation(facelets);

  const { calibrated } = calibrationFor(protocolName);

  return (
    <div className={cn("relative flex flex-col items-center gap-3", className)} data-testid="gyro-twin">
      <div className="flex items-center justify-center" style={{ width: size * 1.9, height: size * 1.9, perspective: size * 7 }}>
        <div
          ref={cubeRef}
          className="relative"
          style={{
            width: size,
            height: size,
            transformStyle: "preserve-3d",
            transform: `${camera} ${cssMatrix3d(HOME_ORIENTATION)}`,
          }}
        >
          <TurnCube facelets={turnView.facelets} turning={turnView.turning} size={size} />
        </div>
      </div>

      {showControls && (
        <div className="flex w-full flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">{gyroActive ? label : "No gyro data from this cube"}</span>
            {lastRotation && (
              <span
                key={lastRotation.id}
                className="animate-[gyro-pop_0.5s_ease-out] rounded-full bg-accent px-2 py-0.5 font-mono text-[11px] font-bold text-accent-fg"
              >
                {lastRotation.token}
              </span>
            )}
          </div>
          {gyroActive && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => recenterGyro()}
                className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                title="Hold the cube yellow top, green front, then tap"
              >
                <Crosshair size={12} /> Re-center
              </button>
              {!calibrated && <span className="text-[10px] text-warning">Uncalibrated — using GAN axes</span>}
            </div>
          )}
        </div>
      )}

      {/* After a reconnect that couldn't keep the old home pose the twin may
          sit at the wrong angle; the compact view has no controls row, so a
          small corner tap target lets it fix itself (40px hit area, icon only,
          out of the way until needed). */}
      {!showControls && gyroActive && gyroNeedsRecenter && (
        <button
          type="button"
          onClick={() => recenterGyro()}
          aria-label="Re-center gyro"
          title="Twin looks off? Hold the cube yellow top, green front, then tap"
          className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full text-muted-2 opacity-70 hover:text-foreground hover:opacity-100"
        >
          <Crosshair size={14} />
        </button>
      )}

      {/* The compact view used inline in the live timer skips the full controls
          row (no room, and no re-center gesture mid-solve) — but "the twin may
          not track your real cube's tilt" is worth a line even there, not
          just on the dedicated Lab page. */}
      {!showControls && gyroActive && !calibrated && !navLocked && (
        <Link href="/lab" className="text-[10px] text-warning underline decoration-dotted underline-offset-2">
          Uncalibrated gyro — calibrate in Lab
        </Link>
      )}
    </div>
  );
}
