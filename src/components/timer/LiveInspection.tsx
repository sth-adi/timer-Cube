"use client";

import type { Penalty } from "@/types";
import { useFrameNow } from "@/components/timer/liveClock";
import { inspectionRemainingAt } from "@/components/timer/liveClockMath";
import { InspectionDigits, InspectionTicks } from "@/components/timer/InspectionDigits";
import { InspectionRing } from "@/components/timer/InspectionRing";

/**
 * The inspection readouts that move every frame — the ring draining around the screen, the digit
 * styling and the ticks — each on the shared frame clock (see liveClock.tsx), so a frame re-renders
 * only these and not the whole smart-cube screen. The parent passes the start time and the
 * flow's whole-second value (`fallbackMs`), which shows until the first frame lands.
 */

export function LiveInspectionRing({ active, startedAtMs, fallbackMs }: { active: boolean; startedAtMs: number | null; fallbackMs: number }) {
  const nowMs = useFrameNow(active);
  return <InspectionRing remainingMs={inspectionRemainingAt(nowMs, startedAtMs, fallbackMs)} active={active} />;
}

export function LiveInspectionDigits({
  startedAtMs,
  fallbackMs,
  penalty,
  styleClass,
}: {
  startedAtMs: number | null;
  fallbackMs: number;
  penalty: Penalty;
  styleClass?: string;
}) {
  const nowMs = useFrameNow(true);
  return <InspectionDigits remainingMs={inspectionRemainingAt(nowMs, startedAtMs, fallbackMs)} penalty={penalty} styleClass={styleClass} />;
}

export function LiveInspectionTicks({ startedAtMs, fallbackMs, penalty }: { startedAtMs: number | null; fallbackMs: number; penalty: Penalty }) {
  const nowMs = useFrameNow(true);
  return <InspectionTicks remainingMs={inspectionRemainingAt(nowMs, startedAtMs, fallbackMs)} penalty={penalty} />;
}
