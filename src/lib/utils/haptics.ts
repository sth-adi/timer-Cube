import {
  DEFAULT_HAPTICS_LEVEL,
  HAPTICS_STORAGE_KEY,
  HAPTIC_PATTERNS,
  levelAllows,
  parseHapticsPref,
  serializeHapticsPref,
  type HapticKind,
  type HapticPattern,
  type HapticsLevel,
} from "@/lib/utils/hapticsModel";

/**
 * Best-effort vibration feedback — silently does nothing where unsupported
 * (desktop, iOS Safari) and when the person has turned haptics off (see
 * hapticsModel.ts for the levels; the preference lives under its own
 * localStorage key, not in the settings store).
 */

let level: HapticsLevel | null = null;
const listeners = new Set<() => void>();

function readStored(): HapticsLevel {
  try {
    return parseHapticsPref(localStorage.getItem(HAPTICS_STORAGE_KEY));
  } catch {
    // Storage blocked (private mode): the default holds for this visit.
    return DEFAULT_HAPTICS_LEVEL;
  }
}

/** The current level; read from storage once, then kept in memory (so a blocked localStorage still remembers the choice for the visit). */
export function getHapticsLevel(): HapticsLevel {
  if (typeof window === "undefined") return DEFAULT_HAPTICS_LEVEL;
  if (level === null) level = readStored();
  return level;
}

export function setHapticsLevel(next: HapticsLevel): void {
  level = next;
  try {
    localStorage.setItem(HAPTICS_STORAGE_KEY, serializeHapticsPref(next));
  } catch {
    // Not remembered beyond this visit.
  }
  for (const l of listeners) l();
}

/** For useSyncExternalStore; also follows changes made in another tab. */
export function subscribeHapticsLevel(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== HAPTICS_STORAGE_KEY && e.key !== null) return;
    level = readStored();
    cb();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** Whether this browser can vibrate at all (false on iOS Safari and most desktops). */
export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function rawVibrate(pattern: HapticPattern): boolean {
  if (!hapticsSupported()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when called outside a user gesture — never worth surfacing.
    return false;
  }
}

/** Vibrates with a raw pattern unless haptics are off. Kept for the existing callers (toasts, ready tick). */
export function vibrate(pattern: number | number[]): void {
  if (getHapticsLevel() === "off") return;
  rawVibrate(pattern);
}

/** Plays one named moment if the current level allows it; returns whether a vibration was requested. */
export function haptic(kind: HapticKind): boolean {
  if (!levelAllows(getHapticsLevel(), kind)) return false;
  return rawVibrate(HAPTIC_PATTERNS[kind]);
}

/** The settings "Test" button: a taste of what the chosen level does, whatever the level is now. Returns false where the device can't vibrate. */
export function previewHaptics(preview: Exclude<HapticsLevel, "off">): boolean {
  if (!hapticsSupported()) return false;
  // One call only: a second vibrate() cancels the first, so Full previews the tick as a lead-in inside one pattern.
  return rawVibrate(preview === "full" ? [8, 90, 8, 90, 8, 160, ...HAPTIC_PATTERNS.finish as number[]] : HAPTIC_PATTERNS.finish);
}
