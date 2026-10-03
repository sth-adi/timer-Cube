/**
 * When to try getting a smart cube back after the Bluetooth link drops out
 * from under you (out of range, the cube napped, an OS hiccup) — pure timing
 * rules, so the schedule is testable without a cube or a clock. The store
 * (lib/store/smartCubeStore.ts) runs the actual attempts.
 *
 * Quick at first, because most drops are a cube that wandered a metre too
 * far or blinked: 1s, 2s, 5s, 10s, then every 30s until a few minutes have
 * gone by, after which a cube that still isn't answering is off or in a bag
 * and a tap on Reconnect is the better ask.
 */

/** Delays before the first few attempts, counted from the drop and then from each failed attempt. */
export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000] as const;
/** The delay between attempts once the quick ones are used up. */
export const RECONNECT_STEADY_MS = 30_000;
/** Stop trying once an attempt would start more than this long after the drop. */
export const RECONNECT_WINDOW_MS = 5 * 60_000;
/** Give up early when the page has been in the background this long (a pocketed phone, another tab). */
export const RECONNECT_HIDDEN_LIMIT_MS = 60_000;
/** Hearing the cube advertise (or the page coming back into view) can cut a wait short, but no sooner than this after the last attempt ended. */
export const EARLY_ATTEMPT_MIN_GAP_MS = 1_000;

/**
 * How long to wait before attempt number `attempt` (0 = the first try after
 * the drop), or null when that try would start past the window and it's
 * time to stop. `elapsedMs` is how long it has been since the drop.
 */
export function reconnectDelay(attempt: number, elapsedMs: number, windowMs: number = RECONNECT_WINDOW_MS): number | null {
  if (attempt < 0 || !Number.isFinite(elapsedMs)) return null;
  const delay = attempt < RECONNECT_BACKOFF_MS.length ? RECONNECT_BACKOFF_MS[attempt] : RECONNECT_STEADY_MS;
  return Math.max(0, elapsedMs) + delay > windowMs ? null : delay;
}

/**
 * When each attempt would start, measured from the drop, if every attempt
 * failed instantly — the shape of the schedule, for display and tests. Real
 * attempts take time, which only pushes later ones further out.
 */
export function reconnectTimeline(windowMs: number = RECONNECT_WINDOW_MS): number[] {
  const at: number[] = [];
  let elapsed = 0;
  for (let attempt = 0; ; attempt++) {
    const delay = reconnectDelay(attempt, elapsed, windowMs);
    if (delay === null) return at;
    elapsed += delay;
    at.push(elapsed);
  }
}

/** The page went into the background at `hiddenSinceMs` (null = it's visible) and has stayed there too long to keep trying. */
export function hiddenTooLong(hiddenSinceMs: number | null, nowMs: number, limitMs: number = RECONNECT_HIDDEN_LIMIT_MS): boolean {
  return hiddenSinceMs !== null && nowMs - hiddenSinceMs >= limitMs;
}

/**
 * Something suggests the cube may be back (it was just heard advertising,
 * or you've returned to the page): whether that's worth an attempt right
 * now instead of waiting out the backoff. Not while an attempt is already
 * running, and not straight after one failed — a cube that advertises but
 * won't connect would otherwise be hammered.
 */
export function tryEarly(trying: boolean, lastAttemptEndedAtMs: number | null, nowMs: number): boolean {
  if (trying) return false;
  return lastAttemptEndedAtMs === null || nowMs - lastAttemptEndedAtMs >= EARLY_ATTEMPT_MIN_GAP_MS;
}
