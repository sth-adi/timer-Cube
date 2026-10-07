/**
 * The pure rules behind the app's small screen-to-screen motion (see
 * src/styles/motion.css and the hooks beside this file), kept apart from React
 * so they can be tested.
 */

/** How long a sheet or dialog takes to leave. Keep in step with --mo-exit in motion.css. */
export const SHEET_EXIT_MS = 180;

/** Which way a tab change should slide: forward (to a later tab) or back. */
export type TabDirection = "fwd" | "back";

/**
 * A tab change as the pane's `data-mo-pane` value: "fwd-a", "back-b", ... The a/b
 * suffix flips on every change, so two quick switches in the same direction
 * still restart the animation (a different animation-name restarts it, no
 * forced reflow needed) instead of the second one being swallowed.
 */
export type TabMotion = `${TabDirection}-${"a" | "b"}`;

export function tabDirection(fromIndex: number, toIndex: number): TabDirection {
  return toIndex >= fromIndex ? "fwd" : "back";
}

export function nextTabMotion(previous: TabMotion | null, fromIndex: number, toIndex: number): TabMotion {
  const flip = previous?.endsWith("-a") ? "b" : "a";
  return `${tabDirection(fromIndex, toIndex)}-${flip}`;
}

/**
 * How long to keep a closing sheet mounted: its exit time plus a frame of
 * slack, or no time at all when motion is off (reduced motion, FX "off") so the
 * sheet is simply gone.
 */
export function exitDelayMs(exitMs: number, motionOff: boolean): number {
  return motionOff ? 0 : Math.max(0, exitMs) + 20;
}

/** A sheet only follows a finger downward; pulling up is ignored. */
export function dragOffset(dy: number): number {
  return dy > 0 ? dy : 0;
}

/**
 * Whether letting go of a dragged sheet should dismiss it: dragged past a
 * third of its height, or flicked down quickly (px per ms) after a short pull.
 */
export function shouldDismissDrag(input: { dy: number; dtMs: number; heightPx: number }): boolean {
  const dy = dragOffset(input.dy);
  if (dy <= 0 || input.heightPx <= 0) return false;
  if (dy >= input.heightPx / 3) return true;
  const velocity = dy / Math.max(1, input.dtMs);
  return dy >= 40 && velocity >= 0.5;
}
