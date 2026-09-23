"use client";

import { Hand } from "lucide-react";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { FACE_COLOR_NAMES } from "@/lib/gyro/orientation";
import { GESTURE_BINDINGS, type GestureId } from "@/lib/smartcube/gestures";
import type { GestureToast as Toast } from "@/hooks/useCubeGestures";
import { cn } from "@/lib/utils/cn";

function FaceChip({ gesture, className }: { gesture: GestureId; className?: string }) {
  const face = gesture[0];
  const ccw = gesture.endsWith("'");
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="h-3 w-3 rounded-[3px] ring-1 ring-black/30" style={{ background: FACELET_COLORS[face] }} />
      <span className="font-mono text-[11px]">{ccw ? "↺" : "↻"}×4</span>
    </span>
  );
}

/** The "gesture recognized" confirmation — floats above the bottom nav so it's visible with the cube still in both hands. */
export function GestureToast({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className={cn(
        "fixed bottom-24 left-1/2 z-50 flex animate-[gesture-toast_0.25s_ease-out] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg",
        toast.ok ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted",
      )}
      style={{ transform: "translateX(-50%)" }}
    >
      <FaceChip gesture={toast.gesture} />
      {toast.label}
    </div>
  );
}

/** Reference card of every gesture, named by center color since that's how the cube reports it whichever way it's held. */
export function GestureLegend({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-1.5 sm:grid-cols-2", className)}>
      {GESTURE_BINDINGS.map((b) => (
        <div key={b.gesture} className="flex items-center justify-between gap-2 rounded-lg bg-bg-panel-2 px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <FaceChip gesture={b.gesture} />
            <span className="capitalize">{FACE_COLOR_NAMES[b.gesture[0]]}</span>
          </span>
          <span className="text-[11px] font-medium text-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export function GestureHint() {
  return (
    <p className="flex items-center gap-1 text-[10px] text-muted-2">
      <Hand size={11} /> Cube gestures on — spin a face 4× to control the app
    </p>
  );
}
