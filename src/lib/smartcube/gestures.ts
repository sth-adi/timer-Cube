/**
 * Cube Gestures: controlling the app with the cube itself. Four quick
 * quarter turns of one face in the same direction (U U U U) is a full 360° —
 * the cube ends exactly where it started, so it's a "free" signal no real
 * scramble or solve would ever produce, and it can be done without looking
 * or putting the cube down.
 *
 * Twelve distinct gestures are possible (6 faces × 2 directions); a face is
 * named by its physical center color, the same way the smart cube itself
 * reports turns, so a gesture means the same thing however you're holding it.
 */

export interface GestureMove {
  token: string;
  timeStampMs: number;
}

/** e.g. "U" (white, clockwise) or "R'" (red, counter-clockwise). */
export type GestureId = `${"U" | "R" | "F" | "D" | "L" | "B"}${"" | "'"}`;

/** Longest pause (ms) allowed between two turns of one gesture — a gesture is a single quick flurry, not four separate turns. */
export const MAX_GAP_MS = 500;

interface Run {
  face: string;
  /** +1 clockwise, -1 counter-clockwise, 0 not yet known (only double turns so far). */
  dir: number;
  quarters: number;
  lastMs: number;
}

export class GestureDetector {
  private run: Run | null = null;

  /** Feed every raw move; returns the gesture it completed, if any. */
  push(move: GestureMove): GestureId | null {
    const face = move.token[0];
    const suffix = move.token.slice(1);
    const quarters = suffix === "2" ? 2 : 1;
    const dir = suffix === "2" ? 0 : suffix === "'" ? -1 : 1;

    const r = this.run;
    const continues =
      r !== null &&
      r.face === face &&
      move.timeStampMs - r.lastMs <= MAX_GAP_MS &&
      (dir === 0 || r.dir === 0 || dir === r.dir);

    if (continues) {
      r.quarters += quarters;
      r.lastMs = move.timeStampMs;
      if (r.dir === 0) r.dir = dir;
    } else {
      this.run = { face, dir, quarters, lastMs: move.timeStampMs };
    }

    const cur = this.run!;
    if (cur.quarters === 4) {
      this.run = null;
      return `${cur.face}${cur.dir === -1 ? "'" : ""}` as GestureId;
    }
    // Overshot (e.g. U2 U U2): not a clean 360°, start over from this move.
    if (cur.quarters > 4) this.run = { face, dir, quarters, lastMs: move.timeStampMs };
    return null;
  }

  reset(): void {
    this.run = null;
  }
}

export type GestureAction =
  | "nextScramble"
  | "previousScramble"
  | "replayLast"
  | "plusTwoLast"
  | "dnfLast"
  | "clearPenaltyLast"
  | "dismissRecap"
  | "recenterGyro";

export interface GestureBinding {
  gesture: GestureId;
  action: GestureAction;
  label: string;
}

/** The fixed gesture map — deliberately not user-remappable yet: a stable vocabulary is easier to build muscle memory for. */
export const GESTURE_BINDINGS: readonly GestureBinding[] = [
  { gesture: "U", action: "nextScramble", label: "Next scramble" },
  { gesture: "U'", action: "previousScramble", label: "Previous scramble" },
  { gesture: "R", action: "replayLast", label: "Replay last solve" },
  { gesture: "L", action: "plusTwoLast", label: "+2 last solve" },
  { gesture: "L'", action: "dnfLast", label: "DNF last solve" },
  { gesture: "F", action: "clearPenaltyLast", label: "Clear penalty" },
  { gesture: "D", action: "dismissRecap", label: "Dismiss recap" },
  { gesture: "B", action: "recenterGyro", label: "Re-center gyro" },
];

export function bindingFor(gesture: GestureId): GestureBinding | undefined {
  return GESTURE_BINDINGS.find((b) => b.gesture === gesture);
}
