"use client";

import { create } from "zustand";
import { DEFAULT_CALIBRATION, type GyroCalibration, type Quat } from "@/lib/gyro/orientation";
import { getLatestGyro } from "./smartCubeBus";
import { useSettingsStore } from "./settingsStore";

/**
 * Runtime (not persisted) gyro state: the raw quaternion that counts as
 * "held in the home grip" for this connection. Everything orientation-
 * related is measured relative to it, so it's re-captured on every connect
 * and whenever the cuber taps Re-center — IMU yaw drifts a few degrees a
 * minute, and a stale reference is the one thing snapping to the 24 cube
 * orientations can't paper over forever.
 */
interface GyroState {
  ref: Quat | null;
  /** Bumped on every re-center, so subscribers can flash a confirmation. */
  refVersion: number;
  setRef: (q: Quat | null) => void;
  /** Declares the cube's current pose to be the home grip (yellow top, green front). Returns false if no gyro sample has arrived yet. */
  recenter: () => boolean;
}

export const useGyroStore = create<GyroState>((set) => ({
  ref: null,
  refVersion: 0,
  setRef: (q) => set((s) => ({ ref: q, refVersion: s.refVersion + 1 })),
  recenter: () => {
    const latest = getLatestGyro();
    if (!latest) return false;
    set((s) => ({ ref: latest.q, refVersion: s.refVersion + 1 }));
    return true;
  },
}));

/** The saved calibration for a protocol, or the GAN default when it's never been calibrated. */
export function calibrationFor(protocolName: string | null): { calibration: GyroCalibration; calibrated: boolean } {
  const saved = protocolName ? useSettingsStore.getState().gyroCalibrations[protocolName] : undefined;
  return saved ? { calibration: saved, calibrated: true } : { calibration: DEFAULT_CALIBRATION, calibrated: false };
}
