"use client";

import { create } from "zustand";
import type { Subscription } from "rxjs";
import type { SmartCubeConnection, SmartCubeEvent } from "smartcube-web-bluetooth";
import { newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { crossHeuristic } from "@/lib/solvers/cross";
import { bottomLayerSolved, orientationSolved, f2lPairSolved } from "@/lib/solvers/oll";
import { recognizeOll, recognizePll, isOllSkip, isPllSkip, toLibraryFrame } from "@/lib/analysis/recognize";
import { mergesIntoDoubleTurn } from "@/lib/analysis/doubleTurns";
import type { GyroSample } from "@/lib/gyro/orientation";
import { emitGyro, emitRawMove, resetLatestGyro } from "./smartCubeBus";
import { useGyroStore } from "./gyroStore";
import { recordTimeMachineMove, resetTimeMachine } from "@/lib/smartcube/timeMachine";

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
  /** When all four F2L pairs (cross + F2L corners/edges) first read solved, same live-detection as crossAtMs. */
  f2lAtMs: number | null;
  /**
   * When each individual F2L pair (index 0-3 = URF/FR, UFL/FL, ULB/BL,
   * UBR/BR — see f2lPairSolved) first read solved, independent of the other
   * 3 and of the cross. A cuber inserts pairs in whatever order they find
   * them, not this fixed index order — the post-solve table sorts these
   * chronologically itself.
   */
  f2lPairAtMs: (number | null)[];
  /** When the last layer first read fully oriented (F2L still intact), i.e. OLL complete. */
  ollAtMs: number | null;
  /**
   * The OLL/PLL case actually faced, recognized the instant the cube reaches
   * that state — no waiting on the full post-solve analyzer. Null while not
   * yet known; "OLL skip"/"PLL skip" when that step was skipped outright;
   * absent (stays null) if the state isn't in the library, e.g. a
   * mis-detected cross.
   */
  ollCaseName: string | null;
  pllCaseName: string | null;
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
  /** Whether this cube's protocol can report a battery level at all — not every brand/model does. */
  batterySupported: boolean;
  /** 0-100, or null before the first reading has come back. */
  batteryLevel: number | null;
  /**
   * True once this connection has actually streamed an orientation sample.
   * Detected from the data rather than read off the protocol's static
   * capability flag, because some drivers (MoYu32 among them) switch the
   * gyro on at connect and stream it despite advertising no gyroscope.
   */
  gyroActive: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  arm: () => void;
  cancel: () => void;
  /** Asks the cube to report its battery level again — cubes don't push this on their own on any regular schedule, so this is also fired once right after connecting. */
  refreshBattery: () => void;
}

let conn: SmartCubeConnection | null = null;
let sub: Subscription | null = null;
let liveCube: CubeJSInstance = newCube();
/**
 * Every gyro sample since the current solve was armed — the raw material
 * for rotation detection once it finishes (see lib/gyro/orientation.ts's
 * detectRotations). Module-level rather than store state for the same
 * reason the gyro bus exists: it grows by dozens of entries a second and
 * nothing needs to re-render when it does. Starts at arm (not first move)
 * so the orientation held during inspection is captured too.
 */
let gyroLog: GyroSample[] = [];

/** The gyro samples recorded for the current (or just-finished) solve. */
export function getGyroLog(): readonly GyroSample[] {
  return gyroLog;
}

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
  f2lAtMs: null,
  f2lPairAtMs: [null, null, null, null],
  ollAtMs: null,
  ollCaseName: null,
  pllCaseName: null,
  moves: [],
  liveFacelets: SOLVED_FACELETS,
  batterySupported: false,
  batteryLevel: null,
  gyroActive: false,

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
      gyroLog = [];
      resetLatestGyro();
      resetTimeMachine();
      useGyroStore.getState().setRef(null);

      sub = connection.events$.subscribe((event: SmartCubeEvent) => {
        if (event.type === "DISCONNECT") {
          set({
            connected: false,
            deviceName: null,
            protocolName: null,
            armed: false,
            recording: false,
            batterySupported: false,
            batteryLevel: null,
            gyroActive: false,
          });
          teardown();
          return;
        }
        if (event.type === "GYRO") {
          const sample = { atMs: event.timestamp, q: event.quaternion };
          emitGyro(sample);
          // First sample of a connection doubles as the home reference —
          // a best guess (the connect screen asks for the yellow-top grip)
          // that Re-center or the calibration wizard can correct any time.
          if (!useGyroStore.getState().ref) useGyroStore.getState().setRef(sample.q);
          if (!get().gyroActive) set({ gyroActive: true });
          // Capped (~10 min at 50Hz) so an armed-and-forgotten cube can't grow it without bound.
          if ((get().armed || get().recording) && gyroLog.length < 30000) gyroLog.push(sample);
          return;
        }
        if (event.type === "BATTERY") {
          set({ batteryLevel: event.batteryLevel });
          return;
        }
        if (event.type !== "MOVE") return;

        emitRawMove({ token: event.move, timeStampMs: event.timestamp });
        recordTimeMachineMove(event.move, event.timestamp);
        liveCube.move(event.move);
        const facelets = liveCube.asString();

        const state = get();
        if (!state.armed) {
          set({ liveFacelets: facelets });
          return;
        }

        // See mergesIntoDoubleTurn's own doc comment for why this merge
        // (and its time gate) exists — short version: some cubes' firmware
        // never reports an atomic 180° turn, only two 90° clicks.
        const rawToken = event.move;
        const lastMove = state.moves[state.moves.length - 1];
        const isDoubleTurn = mergesIntoDoubleTurn(lastMove?.token, lastMove?.timeStampMs, rawToken, event.timestamp);
        const move: SmartCubeMove = isDoubleTurn
          ? { token: `${rawToken[0]}2`, timeStampMs: event.timestamp }
          : { token: rawToken, timeStampMs: event.timestamp };
        // Every milestone below is checked directly off the live cube object
        // (no re-parsing facelets) and only the first time it's reached, so a
        // coincidental alignment mid-scramble or mid-insertion can never
        // register, and breaking it apart again later doesn't erase an
        // already-earned split. This assumes the same cross-on-U convention
        // the app's solver frame uses (see engine.ts) — the cuber's cross
        // ends up on whichever face was "up" when the cube was connected.
        const crossJustSolved = state.crossAtMs === null && crossHeuristic(liveCube) === 0;
        const f2lJustSolved = state.f2lAtMs === null && bottomLayerSolved(liveCube);
        const ollJustSolved = state.ollAtMs === null && orientationSolved(liveCube) && bottomLayerSolved(liveCube);
        const f2lPairAtMs = state.f2lPairAtMs.map((at, i) =>
          at === null && f2lPairSolved(liveCube, i as 0 | 1 | 2 | 3) ? event.timestamp : at,
        );

        // Case recognition wants the algorithm library's last-layer-on-U
        // convention, the mirror of this store's cross-on-U cube — an x2
        // whole-cube rotation swaps them (see frames.ts's mapToLibraryFrame,
        // same rotation). Recognized right as each phase starts, on exactly
        // the state the cuber was looking at when they read the case.
        let ollCaseName = state.ollCaseName;
        if (f2lJustSolved) {
          const libraryFrame = toLibraryFrame(liveCube);
          ollCaseName = isOllSkip(libraryFrame) ? "OLL skip" : (recognizeOll(libraryFrame)?.case.name ?? null);
        }
        let pllCaseName = state.pllCaseName;
        if (ollJustSolved) {
          const libraryFrame = toLibraryFrame(liveCube);
          pllCaseName = isPllSkip(libraryFrame) ? "PLL skip" : (recognizePll(libraryFrame)?.case.name ?? null);
        }

        set((s) => ({
          recording: true,
          startedAtMs: s.startedAtMs ?? event.timestamp,
          crossAtMs: crossJustSolved ? event.timestamp : s.crossAtMs,
          f2lAtMs: f2lJustSolved ? event.timestamp : s.f2lAtMs,
          f2lPairAtMs,
          ollAtMs: ollJustSolved ? event.timestamp : s.ollAtMs,
          ollCaseName,
          pllCaseName,
          moves: isDoubleTurn ? [...s.moves.slice(0, -1), move] : [...s.moves, move],
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
        batterySupported: connection.capabilities.battery,
        batteryLevel: null,
        gyroActive: false,
      });
      if (connection.capabilities.battery) get().refreshBattery();
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
    set({
      connected: false,
      deviceName: null,
      protocolName: null,
      armed: false,
      recording: false,
      batterySupported: false,
      batteryLevel: null,
      gyroActive: false,
    });
  },

  arm: () => {
    gyroLog = [];
    set({
      armed: true,
      recording: false,
      startedAtMs: null,
      solvedAtMs: null,
      crossAtMs: null,
      f2lAtMs: null,
      f2lPairAtMs: [null, null, null, null],
      ollAtMs: null,
      ollCaseName: null,
      pllCaseName: null,
      moves: [],
      error: null,
    });
  },

  cancel: () =>
    set({
      armed: false,
      recording: false,
      startedAtMs: null,
      solvedAtMs: null,
      crossAtMs: null,
      f2lAtMs: null,
      f2lPairAtMs: [null, null, null, null],
      ollAtMs: null,
      ollCaseName: null,
      pllCaseName: null,
      moves: [],
    }),

  refreshBattery: () => {
    if (!conn || !get().batterySupported) return;
    // Fire-and-forget: the reading itself comes back later as a BATTERY
    // event through the same events$ subscription above, not as this
    // command's return value — a cube that doesn't answer just leaves
    // batteryLevel at whatever it was, no error surfaced for something
    // this optional.
    void conn.sendCommand({ type: "REQUEST_BATTERY" }).catch(() => {});
  },
}));
