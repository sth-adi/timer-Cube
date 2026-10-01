"use client";

import { create } from "zustand";
import type { Subscription } from "rxjs";
import type { SmartCubeCapabilities, SmartCubeConnection, SmartCubeEvent } from "smartcube-web-bluetooth";
import { Cube, newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { CROSS_FACES, relabelFacelets, relabelMove, type CrossFace } from "@/lib/smartcube/crossFrame";
import { distrust, newStateSync, onReport, onTurn, settle } from "@/lib/smartcube/stateSync";
import { advanceMilestones, pickMilestones, type Milestones } from "@/lib/smartcube/milestones";
import { mergesIntoDoubleTurn } from "@/lib/analysis/doubleTurns";
import type { GyroSample } from "@/lib/gyro/orientation";
import { emitGyro, emitRawMove, resetLatestGyro } from "./smartCubeBus";
import { useGyroStore } from "./gyroStore";
import { recordTimeMachineMove, resetTimeMachine } from "@/lib/smartcube/timeMachine";
import { friendlyConnectError } from "@/lib/smartcube/friendlyConnectError";
import { writeLastCube } from "@/lib/smartcube/connectMemory";
import { correctBurstTimestamp, type BurstTimestampState } from "@/lib/smartcube/burstTimestamp";

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
  /** The cube's Bluetooth MAC, when the protocol resolves one — diagnostic only, e.g. telling apart two cubes of the same model. */
  deviceMac: string | null;
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
  /**
   * The colour this solve's cross was built on — whichever face's cross
   * completed first. Every later milestone and case is read in that
   * colour's frame, so colour-neutral solving gets the same splits.
   */
  crossFace: CrossFace | null;
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
  /**
   * Where the app's picture of the cube came from: "cube" once the cube has
   * reported its own state (most can — see stateSync.ts), "assumed" when
   * it can't and the app started from solved at connect.
   */
  stateSource: "cube" | "assumed";
  /** The cube can report its state at all (every supported brand but the MoYu MHC). */
  reportsState: boolean;
  /**
   * Several state reports in a row came back malformed (wrong length, a
   * sticker count that can't be a real cube) rather than just disagreeing
   * with the app's own count — a lost turn corrects itself the moment the
   * cube goes still, but garbled reports never will, so "Cube out of sync?"
   * needs calling out explicitly instead of just quietly never resolving.
   * Clears the moment one good report comes back.
   */
  faceletsUnreliable: boolean;
  /**
   * The app's state was corrected from the cube's own report during this
   * solve (a turn was lost over Bluetooth): the time and splits stand, but
   * the recorded turns no longer add up to the solve.
   */
  correctedDuringSolve: boolean;
  /**
   * A DISCONNECT arrived while a solve was armed or in progress — the
   * Bluetooth link itself dropped (out of range, the cube slept, an OS-level
   * hiccup), not a deliberate "Disconnect" click, so the connect screen
   * says so instead of silently reverting to its ordinary first-time
   * wording as if nothing had been mid-flight. Cleared the moment
   * reconnecting succeeds; `droppedMidSolveMoves` keeps how far in it got.
   */
  droppedMidSolve: boolean;
  droppedMidSolveMoves: number | null;
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
  /**
   * What the cube itself reports about its make/firmware, when the
   * protocol supports asking (REQUEST_HARDWARE) — null until that answer
   * comes back, or if it never does. Purely diagnostic (confirming the
   * right cube paired, or that a firmware update might fix a quirk), so
   * nothing in the solving flow depends on it.
   */
  hardwareInfo: { name: string | null; softwareVersion: string | null; hardwareVersion: string | null; productDate: string | null } | null;
  /** What the connection is doing right now ("Select your cube…", "Reading advertisements…", "Connecting…") — null when idle. */
  connectStatus: string | null;
  /**
   * Set while the connection library is asking for the cube's Bluetooth
   * address because the browser wouldn't hand it over: the UI shows a prompt
   * and answers through submitMac. Null otherwise.
   */
  macRequest: { deviceName: string | null } | null;
  /** The cube connected to last time, so the connect screen can offer to reconnect to it. */
  lastCubeName: string | null;
  /** `deviceName`: only offer cubes advertising that name in the picker (a reconnect). */
  connect: (opts?: { deviceName?: string }) => Promise<void>;
  /** Answers macRequest with the address typed in, or null to give up. */
  submitMac: (mac: string | null) => void;
  /** Gives up on a connection in progress (picker open, address search, address prompt). */
  cancelConnect: () => void;
  /** Forgets the remembered cube. */
  forgetLastCube: () => void;
  disconnect: () => void;
  arm: () => void;
  cancel: () => void;
  /**
   * Tells the app the cube in your hands is solved right now. Smart cubes
   * occasionally miss a turn, after which the tracked state no longer
   * matches the real cube (the scramble never "matches", a solve never
   * "finishes"); solving it and calling this puts them back in step.
   */
  resyncSolved: () => void;
  /** Asks the cube to report its battery level again — cubes don't push this on their own on any regular schedule, so this is also fired once right after connecting. */
  refreshBattery: () => void;
  /**
   * A finished solve that lost a turn over Bluetooth has had it put back (see
   * lib/smartcube/turnRepair.ts): swap in the repaired turns and the
   * milestones replayed from them, so the recap reads the solve as it really
   * went. Does nothing mid-attempt.
   */
  adoptRepairedSolve: (moves: SmartCubeMove[], milestones: Milestones) => void;
}

let conn: SmartCubeConnection | null = null;
/** Identifies the connect attempt in flight, so one that's been cancelled can't connect after the fact. */
let connectAttempt = 0;
let connectAbort: AbortController | null = null;
/** Resolves the connection library's pending request for the cube's address. */
let pendingMac: ((mac: string | null) => void) | null = null;
let sub: Subscription | null = null;
let liveCube: CubeJSInstance = newCube();
/**
 * The live cube relabelled for each cross colour — the same state seen as if
 * that colour were white — so any colour's F2L, OLL and PLL can be checked
 * with the white-cross logic. Kept in step with liveCube move for move.
 */
let frames: Record<CrossFace, CubeJSInstance> = freshFrames();
let caps: SmartCubeCapabilities | null = null;
let sync = newStateSync();
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let batteryPollTimer: ReturnType<typeof setInterval> | null = null;
/**
 * State for correctBurstTimestamp, kept across the whole connection (not
 * just one solve) since the cube's own hardware clock it's anchored to
 * never resets between solves.
 */
let burstState: BurstTimestampState | null = null;
/** Consecutive FACELETS reports rejected outright (not even well-formed) — see faceletsUnreliable's own comment. */
let invalidFaceletsStreak = 0;
/** How long the cube must be still before a disagreeing report is believed. */
const SETTLE_MS = 400;
/** After this long without a turn (and not mid-solve), ask the cube where it's at. */
const IDLE_CHECK_MS = 1500;
/** This many bad reports in a row (no good one between) before flagging faceletsUnreliable. */
const INVALID_FACELETS_STREAK_THRESHOLD = 3;
/**
 * How often to re-poll battery on a connection that supports it. Cubes
 * don't push battery updates on any schedule of their own (see
 * refreshBattery's own comment), so left alone the indicator would freeze
 * at whatever it read right after connecting — stale within the first long
 * practice session on a cube that was already low.
 */
const BATTERY_POLL_MS = 5 * 60 * 1000;

/** Takes a full state (from the cube's own report) as the truth. */
function adoptFacelets(facelets: string): void {
  liveCube = Cube.fromString(facelets);
  frames = Object.fromEntries(CROSS_FACES.map((f) => [f, Cube.fromString(relabelFacelets(facelets, f))])) as Record<CrossFace, CubeJSInstance>;
}

function clearSyncTimers(): void {
  if (settleTimer) clearTimeout(settleTimer);
  if (idleTimer) clearTimeout(idleTimer);
  settleTimer = idleTimer = null;
}

function freshFrames(): Record<CrossFace, CubeJSInstance> {
  return Object.fromEntries(CROSS_FACES.map((f) => [f, newCube()])) as Record<CrossFace, CubeJSInstance>;
}

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
  caps = null;
  if (batteryPollTimer) clearInterval(batteryPollTimer);
  batteryPollTimer = null;
  burstState = null;
  invalidFaceletsStreak = 0;
  clearSyncTimers();
}

export const useSmartCubeStore = create<SmartCubeState>((set, get) => ({
  // Both read from the browser, so they start empty and are filled in after hydration (components/chrome/ClientEnv.tsx) — reading them here would make the server's HTML and the client's first render disagree.
  supported: false,
  connecting: false,
  connected: false,
  deviceName: null,
  protocolName: null,
  deviceMac: null,
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
  crossFace: null,
  moves: [],
  liveFacelets: SOLVED_FACELETS,
  stateSource: "assumed",
  reportsState: false,
  faceletsUnreliable: false,
  correctedDuringSolve: false,
  droppedMidSolve: false,
  droppedMidSolveMoves: null,
  batterySupported: false,
  batteryLevel: null,
  gyroActive: false,
  hardwareInfo: null,

  connectStatus: null,
  macRequest: null,
  lastCubeName: null,

  submitMac: (mac) => {
    const resolve = pendingMac;
    pendingMac = null;
    set({ macRequest: null });
    resolve?.(mac);
  },

  cancelConnect: () => {
    connectAttempt++;
    connectAbort?.abort();
    connectAbort = null;
    const resolve = pendingMac;
    pendingMac = null;
    resolve?.(null);
    set({ connecting: false, connectStatus: null, macRequest: null, error: null });
  },

  forgetLastCube: () => {
    writeLastCube(null);
    set({ lastCubeName: null });
  },

  connect: async (opts) => {
    if (!get().supported) {
      set({ error: "This browser doesn't support Web Bluetooth (try Chrome, Edge, or Android)." });
      return;
    }
    const attempt = ++connectAttempt;
    connectAbort?.abort();
    const abort = new AbortController();
    connectAbort = abort;
    set({ connecting: true, error: null, connectStatus: null, macRequest: null });
    try {
      // A test seam: browser tests define window.__smartCubeTestDriver (same
      // connectSmartCube shape) to drive the whole solving flow with scripted
      // turns. Never set by the app itself.
      const testDriver = (globalThis as { __smartCubeTestDriver?: { connectSmartCube: typeof import("smartcube-web-bluetooth").connectSmartCube } }).__smartCubeTestDriver;
      const { connectSmartCube } = testDriver ?? (await import("smartcube-web-bluetooth"));
      // enableAddressSearch lets MoYu32/QiYi cubes resolve their AES MAC
      // address from a bounded set of candidates when the advertisement
      // itself doesn't hand it over. When even that fails (Chrome without
      // advertisement access can't read a GAN cube's address at all), the
      // library asks for it — the address prompt answers.
      const connection = await connectSmartCube({
        enableAddressSearch: true,
        signal: abort.signal,
        ...(opts?.deviceName ? { deviceName: opts.deviceName } : {}),
        onStatus: (message) => {
          if (attempt === connectAttempt) set({ connectStatus: message });
        },
        macAddressProvider: async (device, isFallbackCall) => {
          // The first ask comes before the library has looked for the address itself; only the fallback is worth interrupting for.
          if (!isFallbackCall || attempt !== connectAttempt) return null;
          return new Promise<string | null>((resolve) => {
            pendingMac = resolve;
            set({ macRequest: { deviceName: device.name ?? null }, connectStatus: "Waiting for the cube's address…" });
          });
        },
      });
      // Cancelled while it was still working: don't let it connect after the fact.
      if (attempt !== connectAttempt) {
        void connection.disconnect().catch(() => {});
        return;
      }
      conn = connection;
      liveCube = newCube();
      frames = freshFrames();
      caps = connection.capabilities;
      sync = newStateSync();
      gyroLog = [];
      resetLatestGyro();
      resetTimeMachine();
      useGyroStore.getState().setRef(null);

      sub = connection.events$.subscribe((event: SmartCubeEvent) => {
        if (event.type === "DISCONNECT") {
          const dropped = get();
          const wasActive = dropped.armed || dropped.recording;
          set({
            connected: false,
            deviceName: null,
            protocolName: null,
            deviceMac: null,
            armed: false,
            recording: false,
            batterySupported: false,
            batteryLevel: null,
            gyroActive: false,
            hardwareInfo: null,
            faceletsUnreliable: false,
            // Only ever set here, never on a deliberate disconnect() call —
            // that's the one signal that distinguishes "the Bluetooth link
            // itself dropped mid-attempt" from "you meant to disconnect".
            droppedMidSolve: wasActive,
            droppedMidSolveMoves: wasActive ? dropped.moves.length : null,
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
        if (event.type === "HARDWARE") {
          set({
            hardwareInfo: {
              name: event.hardwareName ?? null,
              softwareVersion: event.softwareVersion ?? null,
              hardwareVersion: event.hardwareVersion ?? null,
              productDate: event.productDate ?? null,
            },
          });
          return;
        }
        if (event.type === "FACELETS") {
          const verdict = onReport(sync, event.facelets);
          if (verdict === "ignore") {
            invalidFaceletsStreak++;
            if (invalidFaceletsStreak >= INVALID_FACELETS_STREAK_THRESHOLD && !get().faceletsUnreliable) set({ faceletsUnreliable: true });
            return;
          }
          if (invalidFaceletsStreak > 0) invalidFaceletsStreak = 0;
          if (get().faceletsUnreliable) set({ faceletsUnreliable: false });
          if (verdict === "adopt") {
            // The first report since connecting: start from wherever the cube really is.
            adoptFacelets(event.facelets);
            set({ liveFacelets: event.facelets, stateSource: "cube" });
          } else if (verdict === "wait") {
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(() => {
              const fix = settle(sync, liveCube.asString());
              if (!fix) return;
              adoptFacelets(fix);
              const st = get();
              // A correction can complete the solve the lost turn was hiding —
              // when it does, catch up the milestones/case names too, since no
              // further MOVE event will come along to run advanceMilestones
              // for us the way it normally does after every turn.
              const completesSolve = fix === SOLVED_FACELETS && st.recording;
              const milestones = completesSolve ? advanceMilestones(pickMilestones(st), liveCube, (f) => frames[f], event.timestamp) : {};
              set({
                ...milestones,
                liveFacelets: fix,
                stateSource: "cube",
                ...(st.armed || st.recording ? { correctedDuringSolve: true } : {}),
              });
              if (completesSolve) set({ armed: false, recording: false, solvedAtMs: st.moves[st.moves.length - 1]?.timeStampMs ?? event.timestamp });
            }, SETTLE_MS);
          }
          return;
        }
        if (event.type !== "MOVE") return;

        // See correctBurstTimestamp's own comment: several turns can arrive
        // in one Bluetooth notification sharing a single host timestamp —
        // this recovers their real spacing from the cube's own hardware
        // clock where the protocol provides one.
        burstState = correctBurstTimestamp(burstState, event);
        const ts = burstState.correctedTimestamp;

        onTurn(sync);
        if (idleTimer) clearTimeout(idleTimer);
        // Once the turning stops (between solves), check the app's picture against the cube's own.
        idleTimer = setTimeout(() => {
          if (caps?.facelets && !get().recording) void conn?.sendCommand({ type: "REQUEST_FACELETS" }).catch(() => {});
        }, IDLE_CHECK_MS);

        emitRawMove({ token: event.move, timeStampMs: ts });
        recordTimeMachineMove(event.move, ts);
        liveCube.move(event.move);
        for (const f of CROSS_FACES) frames[f].move(relabelMove(event.move, f));
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
        const isDoubleTurn = mergesIntoDoubleTurn(lastMove?.token, lastMove?.timeStampMs, rawToken, ts);
        const move: SmartCubeMove = isDoubleTurn
          ? { token: `${rawToken[0]}2`, timeStampMs: ts }
          : { token: rawToken, timeStampMs: ts };
        const milestones = advanceMilestones(pickMilestones(state), liveCube, (f) => frames[f], ts);

        set((s) => ({
          ...milestones,
          recording: true,
          startedAtMs: s.startedAtMs ?? ts,
          moves: isDoubleTurn ? [...s.moves.slice(0, -1), move] : [...s.moves, move],
          liveFacelets: facelets,
        }));

        if (facelets === SOLVED_FACELETS) {
          set({ armed: false, recording: false, solvedAtMs: ts });
        }
      });

      writeLastCube(connection.deviceName || null);
      set({
        lastCubeName: connection.deviceName || null,
        connectStatus: null,
        macRequest: null,
        connected: true,
        connecting: false,
        deviceName: connection.deviceName || connection.protocol.name,
        protocolName: connection.protocol.name,
        deviceMac: connection.deviceMAC || null,
        liveFacelets: SOLVED_FACELETS,
        batterySupported: connection.capabilities.battery,
        batteryLevel: null,
        gyroActive: false,
        hardwareInfo: null,
        stateSource: "assumed",
        reportsState: connection.capabilities.facelets,
        faceletsUnreliable: false,
        correctedDuringSolve: false,
        droppedMidSolve: false,
        droppedMidSolveMoves: null,
      });
      if (connection.capabilities.battery) {
        get().refreshBattery();
        batteryPollTimer = setInterval(() => get().refreshBattery(), BATTERY_POLL_MS);
      }
      // Ask where every piece is right now — the connect-time report can go out before this subscription existed.
      if (connection.capabilities.facelets) void connection.sendCommand({ type: "REQUEST_FACELETS" }).catch(() => {});
      if (connection.capabilities.hardware) void connection.sendCommand({ type: "REQUEST_HARDWARE" }).catch(() => {});
    } catch (err) {
      // Cancelled by the user (or superseded by a newer attempt): already handled, say nothing.
      if (attempt !== connectAttempt) return;
      // The user dismissing the browser's device picker throws too — that's
      // not a real error, just "never mind".
      const message = err instanceof Error ? err.message : String(err);
      teardown();
      set({
        connecting: false,
        connectStatus: null,
        macRequest: null,
        error: /cancelled|user gesture|abort/i.test(message) ? null : friendlyConnectError(message),
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
      deviceMac: null,
      armed: false,
      recording: false,
      batterySupported: false,
      batteryLevel: null,
      gyroActive: false,
      hardwareInfo: null,
      faceletsUnreliable: false,
      // A deliberate disconnect, not the link dropping out from under you —
      // any earlier unexpected-drop banner no longer applies.
      droppedMidSolve: false,
      droppedMidSolveMoves: null,
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
      crossFace: null,
      moves: [],
      correctedDuringSolve: false,
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
      crossFace: null,
      moves: [],
    }),

  resyncSolved: () => {
    liveCube = newCube();
    frames = freshFrames();
    // Tell the cube too, where it can be told — but don't take that on
    // faith even then: a stale report already in flight from before the
    // reset landed would otherwise be trusted as a disagreement and
    // "corrected" straight back to the wrong state. Distrusting always
    // means no report gets believed until one actually agrees, reset or not.
    if (caps?.reset) void conn?.sendCommand({ type: "REQUEST_RESET" }).catch(() => {});
    distrust(sync);
    set({ liveFacelets: SOLVED_FACELETS });
    // Confirm it right away rather than waiting on the idle-check timer,
    // which only fires up to IDLE_CHECK_MS after whatever turn you just
    // made solving it — the whole point of tapping this is to trust the
    // cube again as soon as possible.
    if (caps?.facelets) void conn?.sendCommand({ type: "REQUEST_FACELETS" }).catch(() => {});
  },

  adoptRepairedSolve: (moves, milestones) => {
    const st = get();
    if (st.armed || st.recording || st.solvedAtMs === null) return;
    set({ moves, ...pickMilestones(milestones) });
  },

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
