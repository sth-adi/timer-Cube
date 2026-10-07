"use client";

import { useEffect, useMemo, useState } from "react";
import { TurnCube } from "@/components/lab/TurnCube";
import { useTurnAnimation } from "@/components/lab/useTurnAnimation";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { cn } from "@/lib/utils/cn";
import "@/styles/moments.css";
import { READY_AFTER_MS, READY_MOMENT_MS, READY_WAIT_BATTERY_MS, SOLVED_FACELETS, batterySegments, loopFrames, readyLine, scriptFrames, type ConnectLine } from "./connectScript";
import { useScriptedFrames } from "./useScriptedFrames";

/** The camera the live cube is held in: yellow on top, green in front, a little above and to the left. */
const CAMERA = "rotateX(-24deg) rotateY(32deg) rotateZ(180deg)";
const SEGMENTS = 5;

/** A small layer-turning cube that plays `frames` (see useScriptedFrames), in the live cube's grip. No glow, no shadow. */
function ScriptedCube({ frames, loop, size }: { frames: readonly string[]; loop: boolean; size: number }) {
  const target = useScriptedFrames(frames, loop ? { loop, stepMs: 420, startDelayMs: 500, pauseEvery: 4, pauseMs: 900 } : { stepMs: 190, startDelayMs: 180 });
  const view = useTurnAnimation(target);
  return (
    <div aria-hidden="true" className="connect-cube" style={{ width: size * 1.6, height: size * 1.6, perspective: size * 7 }} data-testid="connect-cube">
      <div className="relative" style={{ width: size, height: size, transformStyle: "preserve-3d", transform: CAMERA }}>
        <TurnCube facelets={view.facelets} turning={view.turning} size={size} />
      </div>
    </div>
  );
}

/** The battery as five plain segments and the percentage, tinted by how low it is (the number carries it too). */
export function BatteryBar({ level }: { level: number }) {
  const filled = batterySegments(level, SEGMENTS) ?? 0;
  const tone = level > 33 ? "bg-foreground/70" : level > 12 ? "bg-warning" : "bg-danger";
  return (
    <span className="flex items-center gap-1.5" data-testid="connect-battery" aria-label={`Battery ${level}%`}>
      <span aria-hidden="true" className="flex gap-[2px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={cn("h-2 w-2.5 rounded-[2px]", i < filled ? tone : "bg-foreground/15")} />
        ))}
      </span>
      <span className="text-[11px] font-medium tabular-nums text-muted">{level}%</span>
    </span>
  );
}

/**
 * While the cube is connecting: the same layer-turning cube as the live view, quietly repeating a
 * right-hand trigger, and the status line saying where the link is (Connecting, then Reading cube).
 * The raw message from the library stays as the line's tooltip. Mounted only while connecting, so a
 * failed connection shows nothing but the error text its parent already draws.
 */
export function ConnectingMoment({ line, detail }: { line: ConnectLine; detail?: string | null }) {
  const frames = useMemo(() => loopFrames(), []);
  return (
    <div className="flex flex-col items-center gap-0.5" data-testid="connect-moment">
      <ScriptedCube frames={frames} loop size={44} />
      <p role="status" className="text-xs text-muted" title={detail ?? undefined} data-testid="connect-line">
        {line}
      </p>
    </div>
  );
}

/**
 * The beat after a cube connects: the cube plays one right-hand trigger and lands exactly on the
 * cube's real state, the line goes Reading cube, then Ready, and the cube's name sits next to its
 * battery. It floats over the page (no layout moves when it leaves) for READY_MOMENT_MS, and is a
 * still card under reduced motion or the flat FX level.
 */
export function ConnectedMoment({ name, batterySupported, batteryLevel, onDone }: { name: string | null; batterySupported: boolean; batteryLevel: number | null; onDone: () => void }) {
  // The cube's state when the moment starts (not followed afterwards), so the turns land on what is really in the hand.
  const [frames] = useState(() => {
    const facelets = useSmartCubeStore.getState().liveFacelets;
    return scriptFrames(facelets.length === 54 ? facelets : SOLVED_FACELETS);
  });
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timers = [setTimeout(() => setElapsed(READY_AFTER_MS), READY_AFTER_MS), setTimeout(() => setElapsed(READY_WAIT_BATTERY_MS), READY_WAIT_BATTERY_MS), setTimeout(onDone, READY_MOMENT_MS)];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);
  const line = readyLine(elapsed, batterySupported && batteryLevel === null);
  return (
    <div className="connect-ready-wrap" data-testid="connect-ready" role="status" aria-label={`${name ?? "Cube"} ${line}`}>
      <div className="connect-ready" style={{ ["--connect-ready-ms" as string]: `${READY_MOMENT_MS}ms` }}>
        <ScriptedCube frames={frames} loop={false} size={44} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-semibold text-foreground">{name ?? "Smart cube"}</p>
          {batterySupported && (batteryLevel !== null ? <BatteryBar level={batteryLevel} /> : <span className="text-[11px] text-muted-2">Battery…</span>)}
          <p className="text-xs text-muted" data-testid="connect-ready-line">
            {line}
          </p>
        </div>
      </div>
    </div>
  );
}
