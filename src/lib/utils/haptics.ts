/** Best-effort vibration feedback — silently does nothing where unsupported (desktop, iOS Safari). */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when called outside a user gesture — never worth surfacing.
  }
}
