/**
 * What the device can afford to animate — used to pick the first-run FX level.
 *
 * The timer digits repaint every frame next to the WebGL cube, and "insane"
 * adds glow, aurora and reactor layers on top. A phone with a handful of weak
 * cores re-rasterises all of that 60 times a second, so a device that looks
 * low-power starts on "spicy" (static upgrades, nothing that tracks the
 * pointer or throws particles). It is only ever a starting point: the choice
 * is made once, and an existing saved level always wins.
 */

export interface DeviceSignals {
  /** The primary pointer is a finger — phones and tablets. */
  coarsePointer: boolean;
  /** navigator.hardwareConcurrency; undefined where the browser hides it. */
  cores?: number;
  /** navigator.deviceMemory in GB (Chromium only, coarsened to 0.25-8); undefined elsewhere. */
  memoryGb?: number;
}

/**
 * Conservative heuristic: a touch device (coarse pointer) AND at most 4 logical
 * cores OR at most 4 GB of RAM. Desktops and laptops are never demoted (a fine
 * pointer, or a big screen with a mouse, stays on "insane" even with 4 cores),
 * and a signal the browser doesn't report counts as "unknown", not "weak" — so
 * Safari on iOS, which has no deviceMemory, is judged by its core count alone.
 */
export function isLowPowerDevice(s: DeviceSignals): boolean {
  if (!s.coarsePointer) return false;
  const fewCores = s.cores !== undefined && s.cores > 0 && s.cores <= 4;
  const littleMemory = s.memoryGb !== undefined && s.memoryGb > 0 && s.memoryGb <= 4;
  return fewCores || littleMemory;
}

export type DeviceFxLevel = "spicy" | "insane";

/** The FX level a device with no saved preference should start on. */
export function defaultFxLevelFor(s: DeviceSignals): DeviceFxLevel {
  return isLowPowerDevice(s) ? "spicy" : "insane";
}

/** True when the persisted settings blob (raw localStorage text) already names an FX level. */
export function hasSavedFxChoice(rawSettings: string | null | undefined): boolean {
  if (!rawSettings) return false;
  try {
    const parsed = JSON.parse(rawSettings) as { state?: { fxLevel?: unknown } } | null;
    return typeof parsed?.state?.fxLevel === "string";
  } catch {
    // Unreadable blob: zustand will fall back to defaults too, so there is no choice to protect.
    return false;
  }
}

/**
 * The level to switch to on first run, or null to leave things alone. Null when
 * the decision was already made on an earlier visit, when settings already hold
 * an FX level (an existing user's choice — never overridden), or when the
 * device doesn't look low-power (the default already fits).
 */
export function firstRunFxLevel(input: { alreadyDecided: boolean; rawSettings: string | null | undefined; signals: DeviceSignals }): DeviceFxLevel | null {
  if (input.alreadyDecided || hasSavedFxChoice(input.rawSettings)) return null;
  const level = defaultFxLevelFor(input.signals);
  return level === "insane" ? null : level;
}

/** Reads the live signals; browser only (callers run it from an effect, never during render). */
export function readDeviceSignals(): DeviceSignals {
  if (typeof window === "undefined") return { coarsePointer: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
  };
}
