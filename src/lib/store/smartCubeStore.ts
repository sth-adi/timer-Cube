"use client";

import { create } from "zustand";
import type { Subscription } from "rxjs";
import type { SmartCubeConnection, SmartCubeEvent } from "smartcube-web-bluetooth";
import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { crossHeuristic } from "@/lib/solvers/cross";

/**
 * Bridges a real Bluetooth smart cube into this app via
 * poliva/smartcube-web-bluetooth's generic connectSmartCube() API — one
 * connection layer covering GAN (Gen1-4), Giiker/GoCube, QiYi, and MoYu
 * (MHC and the `WCU_`-prefixed MoYu32 protocol used by MoYu's current AI
 * cubes, including the V10/V11). Each brand's GATT/encryption handling is
 * real, maintained code in that library — this store just adapts its move
 * stream into the shape the rest of this app already uses.
 *
 * Requires the Web Bluetooth API (Chromium-based browsers, HTTPS or
 * localhost) and a real paired smart cube — there is nothing to simulate
 * here without one.
 */

export interface SmartCubeMove {
  /** Standard move notation, e.g. "R" or "U'" — same tokens the analyzer parses. */
  token: string;
  /** Timestamp (ms) from the connection's own event stream, not wall-clock Date.now(). */
  timeStampMs: number;
}

export const SOLVED_FACELETS = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

interface SmartCubeState {
  /** Whether this browser exposes the Web Bluetooth API at all. */
  supported: boolean;
  connecting: boolean;
  connected: boolean;
  deviceName: string | null;
  /** Which protocol driver actually handled this device, e.g. "MoYu32", "GAN Gen2" — mostly diagnostic. */
  protocolName: string | null;
  error: string | null;
  /** True from the moment recording is armed until a solve completes or is cancelled. */
  armed: boolean;
  /** True once the first physical move has actually been made since arming. */
  recording: boolean;
  startedAtMs: number | null;
  solvedAtMs: number | null;
  /**
   * When the white cross (the U-face cross — see engine.ts's cross
   * convention) first read solved during the current recording, or null
   * if it hasn't yet (or this solve hasn't tracked one). Detected live off
   * the same move stream driving `moves`, no separate phase-marking input
   * needed — unlike the keyboard timer's manual multiphase splits.
   */
  crossAtMs: number | null;
  moves: SmartCubeMove[];
  /**
   * The cube's live state as a 54-char Kociemba facelet string, replayed
   * locally from the move stream starting from an assumed-solved cube at
   * connect time (same calibration assumption the connect screen already
   * asks for). Updated on every move regardless of whether recording is
   * armed, so scramble-tracking (see smartCubeScrambleStore.ts) can watch
   * it continuously, not just during a solve.
   */
  liveFacelets: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  arm: () => void;
  cancel: () => void;
}

let conn: SmartCubeConnection | null = null;
let sub: Subscription | null = null;
let liveCube: CubeJSInstance = newCube();

function teardown(): void {
  sub?.unsubscribe();
  sub = null;
  conn = null;
}

export const useSmartCubeStore = create<SmartCubeState>((set, get) => ({
  supported: typeof navigator !== "undefined" && "bluetooth" in navigator,
  connecting: false,
  connected: false,
  deviceName: null,
  protocolName: null,
  error: null,
  armed: false,
  recording: false,
  startedAtMs: null,
  solvedAtMs: null,
  crossAtMs: null,
  moves: [],
  liveFacelets: SOLVED_FACELETS,

  connect: async () => {
    if (!get().supported) {
      set({ error: "This browser doesn't support Web Bluetooth (try Chrome, Edge, or Android)." });
      return;
    }
    set({ connecting: true, error: null });
    try {
      const { connectSmartCube } = await import("smartcube-web-bluetooth");
      // enableAddressSearch lets MoYu32/QiYi cubes resolve their AES MAC
      // address from a bounded set of candidates when the advertisement
      // itself doesn't hand it over — slower, but this app has no manual
      // "enter your cube's MAC" fallback UI, so it's worth the extra time
      // to make the automatic path succeed more often.
      const connection = await connectSmartCube({ enableAddressSearch: true });
      conn = connection;
      liveCube = newCube();

      sub = connection.events$.subscribe((event: SmartCubeEvent) => {
        if (event.type === "DISCONNECT") {
          set({ connected: false, deviceName: null, protocolName: null, armed: false, recording: false });
          teardown();
          return;
        }
        if (event.type !== "MOVE") return;

        liveCube.move(event.move);
        const facelets = liveCube.asString();

        const state = get();
        if (!state.armed) {
          set({ liveFacelets: facelets });
          return;
        }

        const move: SmartCubeMove = { token: event.move, timeStampMs: event.timestamp };
        // Cross-solved is checked directly off the live cube object (no
        // need to re-parse facelets) — only while actually recording a
        // solve, and only the first time, so a coincidentally cross-solved
        // mid-scramble moment can never register, and re-scrambling the
        // cross back apart mid-solve doesn't erase an already-earned split.
        const crossJustSolved = state.crossAtMs === null && crossHeuristic(liveCube) === 0;
        set((s) => ({
          recording: true,
          startedAtMs: s.startedAtMs ?? event.timestamp,
          crossAtMs: crossJustSolved ? event.timestamp : s.crossAtMs,
          moves: [...s.moves, move],
          liveFacelets: facelets,
        }));

        if (facelets === SOLVED_FACELETS) {
          set({ armed: false, recording: false, solvedAtMs: event.timestamp });
        }
      });

      set({
        connected: true,
        connecting: false,
        deviceName: connection.deviceName || connection.protocol.name,
        protocolName: connection.protocol.name,
        liveFacelets: SOLVED_FACELETS,
      });
    } catch (err) {
      // The user cancelling the browser's device picker throws too — that's
      // not a real error, just "never mind".
      const message = err instanceof Error ? err.message : String(err);
      teardown();
      set({
        connecting: false,
        error: /cancelled|user gesture/i.test(message) ? null : message,
      });
    }
  },

  disconnect: () => {
    void conn?.disconnect();
    teardown();
    set({ connected: false, deviceName: null, protocolName: null, armed: false, recording: false });
  },

  arm: () =>
    set({
      armed: true,
      recording: false,
      startedAtMs: null,
      solvedAtMs: null,
      crossAtMs: null,
      moves: [],
      error: null,
    }),

  cancel: () =>
    set({ armed: false, recording: false, startedAtMs: null, solvedAtMs: null, crossAtMs: null, moves: [] }),
}));
