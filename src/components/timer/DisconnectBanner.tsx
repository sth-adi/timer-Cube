"use client";

import { BluetoothOff, Loader2 } from "lucide-react";
import type { SmartCubeMove } from "@/lib/store/smartCubeStore";
import { LiveCubeMimic } from "@/components/timer/LiveCubeMimic";
import { formatTime } from "@/lib/utils/time";

/** The banner's line while the store is getting the cube back: wording only, the store owns the attempt count. */
export function cubeLostText(attempt: number, trying: boolean): string {
  return `Cube lost — ${trying ? "reconnecting…" : "turn a face to wake it"}${attempt > 1 ? ` · try ${attempt}` : ""}`;
}

/**
 * A slim strip across the top while the link to the cube is being won back mid-solve. It carries
 * the same Try now / Cancel as the full connect screen (and the same test ids, since only one of
 * the two is ever on screen), so the timer and 3D cube can stay in view behind it.
 */
export function DisconnectBanner({
  attempt,
  trying,
  onTryNow,
  onCancel,
}: {
  attempt: number;
  trying: boolean;
  onTryNow: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="auto-reconnect"
      className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-0.5 rounded-xl bg-danger/10 px-3 py-1.5 text-[11px] font-medium text-danger ring-1 ring-danger/30"
    >
      <span className="flex items-center gap-1.5">
        {trying ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> : <BluetoothOff size={13} />}
        {cubeLostText(attempt, trying)}
      </span>
      <span className="flex items-center gap-1">
        {!trying && (
          <button
            type="button"
            onClick={onTryNow}
            className="-my-2.5 flex h-10 items-center px-2 font-semibold text-foreground underline"
            data-testid="auto-reconnect-now"
          >
            Try now
          </button>
        )}
        <button type="button" onClick={onCancel} className="-my-2.5 flex h-10 items-center px-2 text-muted underline hover:text-foreground" data-testid="auto-reconnect-cancel">
          Cancel
        </button>
      </span>
    </div>
  );
}

/**
 * What stays on screen when the cube drops mid-solve and the store is reconnecting: the banner on
 * top, the clock stopped where the last move left it, and the 3D cube with the turns so far, both
 * dimmed. The solve itself is still abandoned (see smartCubeStore); this only keeps the context
 * visible instead of swapping the whole screen for the connect screen.
 */
export function DroppedSolveView({
  attempt,
  trying,
  onTryNow,
  onCancel,
  frozenMs,
  scramble,
  moves,
  moveCount,
}: {
  attempt: number;
  trying: boolean;
  onTryNow: () => void;
  onCancel: () => void;
  /** The solve clock when the last move landed, or null if no turn had been made. */
  frozenMs: number | null;
  scramble: string;
  moves: SmartCubeMove[];
  moveCount: number | null;
}) {
  return (
    <div className="flex w-full max-w-md flex-1 flex-col items-center gap-2.5 py-1 sm:gap-4 sm:py-2" data-testid="dropped-solve-view">
      <DisconnectBanner attempt={attempt} trying={trying} onTryNow={onTryNow} onCancel={onCancel} />
      <div className="flex flex-col items-center gap-2.5 opacity-50 sm:gap-4">
        <p className="timer-digits text-center text-6xl font-bold text-muted" aria-label={frozenMs === null ? "No time: the solve hadn't started" : `Time when the cube dropped: ${formatTime(frozenMs)}`}>
          {frozenMs === null ? "—" : formatTime(frozenMs)}
        </p>
        <div className="card h-40 w-full max-w-[13rem] overflow-hidden rounded-xl" aria-hidden="true">
          <LiveCubeMimic scramble={scramble} moves={moves} className="h-full w-full" />
        </div>
      </div>
      <p className="max-w-xs text-center text-[11px] text-muted">
        The Bluetooth link dropped{moveCount ? ` ${moveCount} move${moveCount === 1 ? "" : "s"} into your solve` : ""} — not a step you missed, the connection itself. That solve can&apos;t be saved; once the cube is back, start the scramble again.
      </p>
    </div>
  );
}
