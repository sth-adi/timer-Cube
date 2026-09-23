/**
 * What a keyboard event means for the timer. Pure, so the rules — space
 * only, auto-repeat ignored, never while typing in a field — are testable
 * without a DOM.
 */
export type KeyAction = "press" | "release" | "reset" | null;

export interface KeyLike {
  type: "keydown" | "keyup";
  code: string;
  repeat: boolean;
  /** The event target is a text input or textarea. */
  inField: boolean;
}

export function keyAction(e: KeyLike): KeyAction {
  if (e.inField) return null;
  if (e.code === "Space") {
    if (e.type === "keyup") return "release";
    // Holding space fires keydown again every ~30ms; only the first counts.
    return e.repeat ? null : "press";
  }
  if (e.code === "Escape" && e.type === "keydown") return "reset";
  return null;
}

export function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true);
}
