"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Compass, RotateCcw } from "lucide-react";
import { subscribeGyro } from "@/lib/store/smartCubeBus";
import { useGyroStore } from "@/lib/store/gyroStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { angleBetween, quatToMat, solveCalibration, type Mat3, type Quat } from "@/lib/gyro/orientation";
import { cn } from "@/lib/utils/cn";

/** How still (degrees of drift) and for how long (ms) the cube must be held before a pose is captured automatically. */
const STILL_DEG = 4;
const STILL_MS = 700;
/** A captured pose has to be at least this far (degrees) from the previous one — i.e. the rotation actually happened. */
const MIN_TURN_DEG = 60;

type Step = "intro" | "home" | "y" | "yx" | "done" | "failed";

const STEP_COPY: Record<"home" | "y" | "yx", { title: string; body: string }> = {
  home: {
    title: "Hold the home grip",
    body: "Yellow on top, green facing you. Hold it still.",
  },
  y: {
    title: "Now do a y",
    body: "Turn the whole cube like a U move — green goes to your left — and hold still.",
  },
  yx: {
    title: "Now an x",
    body: "Without going back: tip the whole cube like an R move — front face comes up to the top — and hold still.",
  },
};

/**
 * The gyro calibration wizard. Every smart-cube brand mounts its IMU chip
 * differently and some report quaternions in the opposite handedness, so
 * rather than hard-coding per-brand axis tables this just watches three
 * poses the cuber holds (home → y → y x) and solves for the mounting that
 * explains them (see solveCalibration). Poses are captured automatically
 * once the cube is held still — no buttons to press with a cube in hand.
 */
export function GyroCalibration({ onClose }: { onClose?: () => void }) {
  const protocolName = useSmartCubeStore((s) => s.protocolName);
  const setGyroCalibration = useSettingsStore((s) => s.setGyroCalibration);
  const setRef = useGyroStore((s) => s.setRef);
  const [step, setStep] = useState<Step>("intro");
  const [stillness, setStillness] = useState(0);
  const captures = useRef<Quat[]>([]);

  useEffect(() => {
    if (step !== "home" && step !== "y" && step !== "yx") return;
    let anchor: { m: Mat3; q: Quat; since: number } | null = null;
    let done = false;
    const previous = captures.current[captures.current.length - 1];
    const previousMat = previous ? quatToMat(previous) : null;

    const unsubscribe = subscribeGyro(({ q, atMs }) => {
      if (done) return;
      const m = quatToMat(q);
      if (!anchor || angleBetween(anchor.m, m) > STILL_DEG) {
        anchor = { m, q, since: atMs };
        setStillness(0);
        return;
      }
      // Still — but a y/x step only counts once the cube has actually turned away from the last pose.
      if (previousMat && angleBetween(previousMat, m) < MIN_TURN_DEG) {
        setStillness(0);
        return;
      }
      const held = atMs - anchor.since;
      setStillness(Math.min(1, held / STILL_MS));
      if (held < STILL_MS) return;
      done = true;
      captures.current = [...captures.current, anchor.q];
      if (step === "home") setStep("y");
      else if (step === "y") setStep("yx");
      else {
        const [home, afterY, afterYX] = captures.current;
        const result = solveCalibration(home, afterY, afterYX);
        if (result && protocolName) {
          setGyroCalibration(protocolName, result.calibration);
          setRef(home);
          setStep("done");
        } else {
          setStep("failed");
        }
      }
    });
    return unsubscribe;
  }, [step, protocolName, setGyroCalibration, setRef]);

  const start = () => {
    captures.current = [];
    setStillness(0);
    setStep("home");
  };

  const stepIndex = step === "home" ? 0 : step === "y" ? 1 : step === "yx" ? 2 : -1;

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {step === "intro" && (
        <>
          <Compass size={26} className="text-accent" />
          <p className="max-w-xs text-sm text-muted">
            Teach the app how your cube&apos;s gyro chip is mounted. Three poses, about ten seconds — each one captures
            itself once you hold still.
          </p>
          <button type="button" onClick={start} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
            Start calibration
          </button>
        </>
      )}

      {stepIndex >= 0 && (
        <>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn("h-1.5 w-8 rounded-full", i < stepIndex ? "bg-success" : i === stepIndex ? "bg-accent" : "bg-bg-panel-2")} />
            ))}
          </div>
          <p className="text-sm font-semibold text-foreground">{STEP_COPY[step as "home" | "y" | "yx"].title}</p>
          <p className="max-w-xs text-xs text-muted">{STEP_COPY[step as "home" | "y" | "yx"].body}</p>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-bg-panel-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${stillness * 100}%` }} />
          </div>
          <p className="text-[10px] text-muted-2">{stillness > 0 ? "Hold still…" : "Waiting for the pose"}</p>
        </>
      )}

      {step === "done" && (
        <>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
            <Check size={20} className="text-success" />
          </div>
          <p className="text-sm font-semibold text-foreground">Calibrated for {protocolName}</p>
          <p className="max-w-xs text-xs text-muted">Saved for every cube using this protocol. The home grip was re-centered too.</p>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-medium text-foreground">
              Done
            </button>
          )}
        </>
      )}

      {step === "failed" && (
        <>
          <p className="text-sm font-semibold text-warning">Those poses didn&apos;t line up</p>
          <p className="max-w-xs text-xs text-muted">
            Usually a rotation went the other way or wasn&apos;t a clean quarter turn. Try again, a bit more deliberately.
          </p>
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
          >
            <RotateCcw size={13} /> Try again
          </button>
        </>
      )}
    </div>
  );
}
