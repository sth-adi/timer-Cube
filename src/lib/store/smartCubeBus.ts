/**
 * Imperative pub-sub channels for the smart cube's high-frequency streams —
 * the same deliberately-not-Zustand pattern as performanceAuraBus.ts. A gyro
 * cube pushes 20-60 orientation samples a second; routing those through a
 * store would re-render every subscriber that often for a value only one
 * CSS transform actually needs. Consumers subscribe and write to the DOM (or
 * a ref) directly.
 */

import type { Quat } from "@/lib/gyro/orientation";

export interface RawCubeMove {
  /** Exactly what the cube reported — never merged into doubles, never filtered by armed/recording state. */
  token: string;
  timeStampMs: number;
}

export interface GyroReading {
  atMs: number;
  q: Quat;
}

type Listener<T> = (value: T) => void;

function channel<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit(value: T) {
      for (const l of listeners) l(value);
    },
    subscribe(listener: Listener<T>): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const moves = channel<RawCubeMove>();
const gyro = channel<GyroReading>();
let latestGyro: GyroReading | null = null;

/** Every physical turn, the instant it arrives — scrambling, idle fiddling, and solving alike. Cube Gestures listens here. */
export const emitRawMove = moves.emit;
export const subscribeRawMoves = moves.subscribe;

export function emitGyro(reading: GyroReading): void {
  latestGyro = reading;
  gyro.emit(reading);
}

export const subscribeGyro = gyro.subscribe;

/** The most recent gyro sample, for one-off reads like "capture this pose" in calibration. */
export function getLatestGyro(): GyroReading | null {
  return latestGyro;
}

export function resetLatestGyro(): void {
  latestGyro = null;
}
