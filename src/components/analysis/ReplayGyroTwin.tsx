"use client";

import { GYRO_TWIN_CAMERA } from "@/components/lab/GyroTwin";
import { TurnCube } from "@/components/lab/TurnCube";
import { TwinStage } from "@/components/lab/TwinStage";
import { parseTurn } from "@/lib/cube-engine/stickerTurns";
import { cssMatrix3d, quatToMat } from "@/lib/gyro/orientation";
import { solveMsAtPosition, streamQuatAt } from "@/lib/gyro/replayGyro";
import type { GyroStreamData } from "@/lib/gyro/solveGyro";

/**
 * The Gyro Twin as it was in a recorded solve: a small 3D cube, tilted as the real cube was tilted
 * at this moment of the replay and showing the stickers it had then. Drawn over the replay's cube,
 * so a regrip or a tilt mid-solve can be seen alongside the turns.
 *
 * `faceletsAfter[k]` is the cube with the first k moves made (so one more entry than there are
 * moves); `moveMs` is when each move was really made, ms from the solve's start; `starts` and `ends`
 * are when each begins and finishes on the replay's own clock. The move playing is drawn as that
 * layer turning, by how far through it the replay is — so scrubbing shows it at any point.
 */
export function ReplayGyroTwin({
  stream,
  faceletsAfter,
  moveMs,
  starts,
  ends,
  moves,
  positionMs,
  activeMove,
  size = 48,
}: {
  stream: GyroStreamData;
  faceletsAfter: readonly string[];
  moveMs: readonly number[];
  starts: readonly number[];
  ends: readonly number[];
  /** The tokens the replay plays, one per entry of `starts`. */
  moves: readonly string[];
  positionMs: number;
  activeMove: number;
  size?: number;
}) {
  const q = streamQuatAt(stream, solveMsAtPosition(starts, moveMs, positionMs));
  // The turn in progress: the cube before it, plus how far round the layer is. Finished (or not a face turn) shows the result.
  const k = activeMove;
  const turn = k >= 0 ? parseTurn(moves[k] ?? "") : null;
  const span = k >= 0 ? (ends[k] ?? 0) - (starts[k] ?? 0) : 0;
  const progress = turn && span > 0 ? (positionMs - starts[k]) / span : 1;
  const turning = turn && progress < 1 ? { turn, progress: Math.max(0, progress) } : null;
  const facelets = turning ? faceletsAfter[k] : faceletsAfter[Math.min(faceletsAfter.length - 1, Math.max(0, k + 1))];
  if (!q || !facelets) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-bg-panel/60 p-1 backdrop-blur-sm" aria-hidden="true" data-testid="replay-gyro-twin">
      <TwinStage size={size} box={1.7} drop={0.8}>
        <div
          className="relative"
          style={{
            width: size,
            height: size,
            transformStyle: "preserve-3d",
            transform: `${GYRO_TWIN_CAMERA} ${cssMatrix3d(quatToMat(q))}`,
          }}
        >
          <TurnCube facelets={facelets} turning={turning} size={size} />
        </div>
      </TwinStage>
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-2">Gyro</span>
    </div>
  );
}
