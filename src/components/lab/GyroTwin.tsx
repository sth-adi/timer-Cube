"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crosshair } from "lucide-react";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { subscribeGyro } from "@/lib/store/smartCubeBus";
import { calibrationFor, useGyroStore } from "@/lib/store/gyroStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { HOME_ORIENTATION, RotationTracker, cssMatrix3d, orientationLabel, type Mat3 } from "@/lib/gyro/orientation";
import { cn } from "@/lib/utils/cn";

/**
 * Each face's placement in the body frame (white on top), where its
 * 9-facelet block starts in the Kociemba string, and a fixed brightness —
 * baked into the face itself (not the current view), like a faint material
 * difference sculpted into the plastic, so it reads as depth from any
 * orientation instead of a directional light that would go wrong the
 * moment the twin turns. With these transforms the natural row-major
 * sticker order lands correctly on all six faces.
 */
const FACES: { start: number; transform: (h: number) => string; shade: number }[] = [
  { start: 0, transform: (h) => `rotateX(90deg) translateZ(${h}px)`, shade: 1.08 }, // U
  { start: 9, transform: (h) => `rotateY(90deg) translateZ(${h}px)`, shade: 0.96 }, // R
  { start: 18, transform: (h) => `translateZ(${h}px)`, shade: 1.0 }, // F
  { start: 27, transform: (h) => `rotateX(-90deg) translateZ(${h}px)`, shade: 0.82 }, // D
  { start: 36, transform: (h) => `rotateY(-90deg) translateZ(${h}px)`, shade: 0.9 }, // L
  { start: 45, transform: (h) => `rotateY(180deg) translateZ(${h}px)`, shade: 0.88 }, // B
];

/** A fixed camera slightly above and to the right, so at any orientation you see three faces — like looking down at the cube in your own hands. */
const CAMERA = "rotateX(-24deg) rotateY(-32deg)";

function CubeFaces({ facelets, size }: { facelets: string; size: number }) {
  const half = size / 2;
  return (
    <>
      {FACES.map((face) => (
        <div
          key={face.start}
          className="absolute left-0 top-0 grid grid-cols-3 grid-rows-3 rounded-[6px] bg-black p-[3px]"
          style={{ width: size, height: size, gap: 3, transform: face.transform(half), backfaceVisibility: "hidden", filter: `brightness(${face.shade})` }}
        >
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="rounded-[3px]" style={{ background: FACELET_COLORS[facelets[face.start + i]] ?? "#555" }} />
          ))}
        </div>
      ))}
    </>
  );
}

interface GyroTwinProps {
  size?: number;
  className?: string;
  /** Show the orientation readout, last rotation, and Re-center button under the cube. */
  showControls?: boolean;
  /** Where the viewer is, as a CSS rotation — defaults to looking down at the cube in your own hands. */
  camera?: string;
}

/**
 * The Gyro Twin: a live 3D copy of the physical cube in your hands — every
 * sticker from the move stream, and its real-world orientation from the
 * cube's own IMU, so tilting the cube tilts the twin. Built from plain CSS
 * 3D faces (like CubeLookaheadIcon) rather than a WebGL scene; orientation
 * updates go straight to the DOM via a ref, one rAF-coalesced write per
 * frame, never through React state.
 *
 * Also runs a live RotationTracker so whole-cube rotations get named the
 * instant they settle ("y", "x'"…) — the same detector that writes them into
 * rotation-aware reconstructions after a solve.
 */
export function GyroTwin({ size = 120, className, showControls = true, camera = CAMERA }: GyroTwinProps) {
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const facelets = useSmartCubeStore((s) => s.liveFacelets);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);
  const protocolName = useSmartCubeStore((s) => s.protocolName);
  const ref = useGyroStore((s) => s.ref);
  const recenter = useGyroStore((s) => s.recenter);
  // Re-read on calibration changes so a freshly saved calibration applies immediately.
  const calibrations = useSettingsStore((s) => s.gyroCalibrations);
  const [label, setLabel] = useState(orientationLabel(HOME_ORIENTATION));
  const [lastRotation, setLastRotation] = useState<{ token: string; id: number } | null>(null);

  useEffect(() => {
    const el = cubeRef.current;
    if (!el) return;
    el.style.transform = `${camera} ${cssMatrix3d(HOME_ORIENTATION)}`;
    if (!ref) return;
    const { calibration } = calibrationFor(protocolName);
    const tracker = new RotationTracker(ref, calibration);
    let pending: Mat3 | null = null;
    let raf = 0;
    let rotationId = 0;
    const flush = () => {
      raf = 0;
      if (pending) el.style.transform = `${camera} ${cssMatrix3d(pending)}`;
    };
    const unsubscribe = subscribeGyro((sample) => {
      const out = tracker.push(sample);
      pending = out.orientation;
      if (!raf) raf = requestAnimationFrame(flush);
      if (out.segment) setLabel(orientationLabel(out.segment.orientation));
      if (out.rotation) setLastRotation({ token: out.rotation.token, id: ++rotationId });
    });
    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, protocolName, calibrations, camera]);

  const { calibrated } = calibrationFor(protocolName);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
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
          <CubeFaces facelets={facelets} size={size} />
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
                onClick={() => recenter()}
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

      {/* The compact view used inline in the live timer skips the full controls
          row (no room, and no re-center gesture mid-solve) — but "the twin may
          not track your real cube's tilt" is worth a line even there, not
          just on the dedicated Lab page. */}
      {!showControls && gyroActive && !calibrated && (
        <Link href="/lab" className="text-[10px] text-warning underline decoration-dotted underline-offset-2">
          Uncalibrated gyro — calibrate in Lab
        </Link>
      )}
    </div>
  );
}
