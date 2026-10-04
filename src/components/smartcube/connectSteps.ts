/**
 * Pure helpers for the connect screen: which of the three connection steps a
 * status message belongs to, and the wording for a drop-and-retry. The
 * messages come from smartcube-web-bluetooth's `onStatus` (and the store's
 * own "Waiting for the cube's address…"); nothing here adds a state the
 * store doesn't already expose.
 */

export const CONNECT_STEPS = ["Pick", "Address", "Connect"] as const;
export type ConnectStep = 0 | 1 | 2;

/** How long a connection may sit before the screen offers hints. */
export const SLOW_CONNECT_MS = 6000;

/**
 * 0 = choosing the cube in the browser's list ("Select your cube…", or no
 * message yet), 1 = finding the cube's Bluetooth address (reading its
 * advertisements, testing candidates, or asking you for it), 2 = connecting
 * (opening the link, verifying it). Any other message is the library working
 * on the link itself, so counts as connecting.
 */
export function connectStep(status: string | null): ConnectStep {
  if (!status) return 0;
  if (/^select your cube/i.test(status)) return 0;
  if (/address|advertisement/i.test(status)) return 1;
  return 2;
}

export const CONNECT_HINTS = [
  "Turn a face to wake the cube.",
  "Check its battery.",
  "Close other apps or tabs that use it.",
] as const;

export const RECONNECT_HINTS = [
  "Turn a face to wake the cube.",
  "Keep it close to this device.",
  "Close other apps or tabs that use it.",
] as const;

/** The line shown while the link is being won back after an unexpected drop — worded as a drop, not as a first connection. */
export function reconnectLine(name: string | null, trying: boolean): string {
  return trying ? `Lost the link to ${name ?? "your cube"} — getting it back…` : `${name ?? "Your cube"} went quiet — will try again shortly`;
}

/** Said on the connect screen before connecting: the gyro's home pose is the first sample, assumed to be this grip (see lib/gyro/homePose.ts). */
export const HOLD_LINE = "Hold it with yellow on top and green facing you, then connect.";

export type GyroStatus = "none" | "calibrated" | "uncalibrated";

/**
 * What the settings panel says about the connected cube's gyro: whether it
 * streams orientation at all (detected from data, so a cube that has just
 * connected reads "none" until its first sample), and whether this protocol
 * has a saved axis calibration (otherwise the GAN default applies).
 */
export function gyroStatus(gyroActive: boolean, protocolName: string | null, calibrations: Readonly<Record<string, unknown>>): GyroStatus {
  if (!gyroActive) return "none";
  return protocolName && calibrations[protocolName] ? "calibrated" : "uncalibrated";
}

export const GYRO_STATUS_LABEL: Record<GyroStatus, string> = {
  calibrated: "Calibrated",
  uncalibrated: "Not calibrated",
  none: "No gyro signal",
};
