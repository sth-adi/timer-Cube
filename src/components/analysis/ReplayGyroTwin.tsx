"use client";

import { CubeFaces, GYRO_TWIN_CAMERA } from "@/components/lab/GyroTwin";
import { cssMatrix3d, quatToMat } from "@/lib/gyro/orientation";
import { solveMsAtPosition, streamQuatAt } from "@/lib/gyro/replayGyro";
import type { GyroStreamData } from "@/lib/gyro/solveGyro";

/**
 * The Gyro Twin as it was in a recorded solve: a small 3D cube, tilted as the real cube was tilted
 * at this moment of the replay and showing the stickers it had then. Drawn over the replay's cube,
 * so a regrip or a tilt mid-solve can be seen alongside the turns.
 *
 * `faceletsAfter[k]` is the cube with the first k moves made (so one more entry than there are
 * moves); `moveMs` is when each move was really made, ms from the solve's start; `starts` is when each
 * begins on the replay's own clock.
 */
export function ReplayGyroTwin({
  stream,
  faceletsAfter,
  moveMs,
  starts,
  positionMs,
  activeMove,
  size = 48,
}: {
  stream: GyroStreamData;
  faceletsAfter: readonly string[];
  moveMs: readonly number[];
  starts: readonly number[];
  positionMs: number;
  activeMove: number;
  size?: number;
}) {
  const q = streamQuatAt(stream, solveMsAtPosition(starts, moveMs, positionMs));
  const facelets = faceletsAfter[Math.min(faceletsAfter.length - 1, Math.max(0, activeMove + 1))];
  if (!q || !facelets) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-bg-panel/60 p-1 backdrop-blur-sm" aria-hidden="true" data-testid="replay-gyro-twin">
      <div className="flex items-center justify-center" style={{ width: size * 1.7, height: size * 1.7, perspective: size * 7 }}>
        <div
          className="relative"
          style={{
            width: size,
            height: size,
            transformStyle: "preserve-3d",
            transform: `${GYRO_TWIN_CAMERA} ${cssMatrix3d(quatToMat(q))}`,
            transition: "transform 90ms linear",
          }}
        >
          <CubeFaces facelets={facelets} size={size} />
        </div>
      </div>
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-2">Gyro</span>
    </div>
  );
}
