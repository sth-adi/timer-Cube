"use client";

import { create } from "zustand";

/**
 * Bridges a real Bluetooth smart cube (GAN / GiiKER / GoCube — anything
 * cubing.js's bluetooth module supports) into this app. cubing.js already
 * ships a maintained, real implementation of these cubes' BLE protocols —
 * this store just wraps it with the state shape the rest of the app needs,
 * rather than us re-deriving fragile GATT parsing ourselves.
 *
 * Requires the Web Bluetooth API (Chromium-based browsers, HTTPS or
 * localhost) and a real paired smart cube — there is nothing to simulate
 * here without one.
 */

export interface SmartCubeMove {
  /** Standard move notation, e.g. "R" or "U'" — same tokens the analyzer parses. */
  token: string;
  /** High-resolution timestamp (ms) from the cube's own event, not wall-clock Date.now(). */
  timeStampMs: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BluetoothPuzzleInstance = any;

interface SmartCubeState {
  /** Whether this browser exposes the Web Bluetooth API at all. */
  supported: boolean;
  connecting: boolean;
  connected: boolean;
  deviceName: string | null;
  error: string | null;
  /** True from the moment recording is armed until a solve completes or is cancelled. */
  armed: boolean;
  /** True once the first physical move has actually been made since arming. */
  recording: boolean;
  startedAtMs: number | null;
  solvedAtMs: number | null;
  moves: SmartCubeMove[];
  connect: () => Promise<void>;
  disconnect: () => void;
  arm: () => void;
  cancel: () => void;
}

let puzzle: BluetoothPuzzleInstance | null = null;

/**
 * `pattern.experimentalIsSolved` ignores which way the physical cube is
 * currently held (there's no reason a solved cube has to land back in its
 * starting orientation) and whether the center pieces have spun in place
 * (cosmetic on a real cube, and most smart cubes can't even track it).
 */
function isPatternSolved(pattern: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (pattern as any).experimentalIsSolved({
    ignorePuzzleOrientation: true,
    ignoreCenterOrientation: true,
  });
}

export const useSmartCubeStore = create<SmartCubeState>((set, get) => ({
  supported: typeof navigator !== "undefined" && "bluetooth" in navigator,
  connecting: false,
  connected: false,
  deviceName: null,
  error: null,
  armed: false,
  recording: false,
  startedAtMs: null,
  solvedAtMs: null,
  moves: [],

  connect: async () => {
    if (!get().supported) {
      set({ error: "This browser doesn't support Web Bluetooth (try Chrome, Edge, or Android)." });
      return;
    }
    set({ connecting: true, error: null });
    try {
      const { connectSmartPuzzle } = await import("cubing/bluetooth");
      const connected = await connectSmartPuzzle();
      puzzle = connected;

      connected.addAlgLeafListener((event: { latestAlgLeaf: { toString(): string }; timeStamp: number; pattern?: unknown }) => {
        const state = get();
        if (!state.armed) return;

        const token = event.latestAlgLeaf.toString();
        const move: SmartCubeMove = { token, timeStampMs: event.timeStamp };

        set((s) => ({
          recording: true,
          startedAtMs: s.startedAtMs ?? event.timeStamp,
          moves: [...s.moves, move],
        }));

        if (event.pattern && isPatternSolved(event.pattern)) {
          set({ armed: false, recording: false, solvedAtMs: event.timeStamp });
        }
      });

      connected.addEventListener("disconnect", () => {
        set({ connected: false, deviceName: null, armed: false, recording: false });
        puzzle = null;
      });

      set({
        connected: true,
        connecting: false,
        deviceName: connected.name() ?? "Smart cube",
      });
    } catch (err) {
      // The user cancelling the browser's device picker throws too — that's
      // not a real error, just "never mind".
      const message = err instanceof Error ? err.message : String(err);
      set({
        connecting: false,
        error: /cancelled|user gesture/i.test(message) ? null : message,
      });
    }
  },

  disconnect: () => {
    puzzle?.disconnect();
    puzzle = null;
    set({ connected: false, deviceName: null, armed: false, recording: false });
  },

  arm: () => set({ armed: true, recording: false, startedAtMs: null, solvedAtMs: null, moves: [], error: null }),

  cancel: () => set({ armed: false, recording: false, startedAtMs: null, solvedAtMs: null, moves: [] }),
}));
