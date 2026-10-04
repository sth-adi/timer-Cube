"use client";

import { create } from "zustand";
import type { Subscription } from "rxjs";
import type { SmartCubeCapabilities, SmartCubeConnection, SmartCubeEvent } from "smartcube-web-bluetooth";
import { Cube, newCube, type CubeJSInstance } from "@/lib/cube-engine/engine";
import { CROSS_FACES, relabelFacelets, relabelMove, type CrossFace } from "@/lib/smartcube/crossFrame";
import { distrust, newStateSync, onReport, onTurn, settle } from "@/lib/smartcube/stateSync";
import { advanceMilestones, pickMilestones, type Milestones } from "@/lib/smartcube/milestones";
import { mergesIntoDoubleTurn } from "@/lib/analysis/doubleTurns";
import { appendGyroSample } from "@/lib/gyro/gyroLog";
import type { GyroSample, Quat } from "@/lib/gyro/orientation";
import { decideGyroHome, StillnessDetector } from "@/lib/gyro/homePose";
import { emitGyro, emitRawMove, resetLatestGyro } from "./smartCubeBus";
import { useGyroStore } from "./gyroStore";
import { recordTimeMachineMove, resetTimeMachine } from "@/lib/smartcube/timeMachine";
import { friendlyConnectError } from "@/lib/smartcube/friendlyConnectError";
import { readLastCube, writeLastCube } from "@/lib/smartcube/connectMemory";
import { correctBurstTimestamp, type BurstTimestampState } from "@/lib/smartcube/burstTimestamp";
import { lostTurnTimeMs } from "@/lib/smartcube/lostTurnTime";
import { hiddenTooLong, reconnectDelay, RECONNECT_HIDDEN_LIMIT_MS, tryEarly } from "@/lib/smartcube/autoReconnect";
import { captureChosenDevice, connectKnownDevice, findPermittedDevice } from "@/lib/smartcube/knownDevice";

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
  /**
   * Whether this browser exposes the Web Bluetooth API at all. `null` until
   * the page has hydrated and asked the browser (the server can't know), so
   * "unsupported" is only ever shown for `false`; `null` is "not known yet" and
   * should render neutral, not the unsupported message.
   */
  supported: boolean | null;
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
  /** The cube connected to last time, so the connect screen can offer to reconnect to it. Filled in together with `supported` after hydration. */
  lastCubeName: string | null;
  /**
   * The gyro's home pose (see lib/gyro/homePose.ts) is a guess nobody has
   * confirmed: the link came back mid-session without a reference that could
   * be trusted, so the twin's orientation, regrip names and oriented
   * reconstruction may be off until Re-center. Cleared by any re-center.
   */
  gyroNeedsRecenter: boolean;
  /** Declares the cube's current pose to be the home grip (yellow top, green front), clearing gyroNeedsRecenter. False if no gyro sample has arrived yet. */
  recenterGyro: () => boolean;
  /**
   * Getting the cube back on its own after the link dropped unexpectedly
   * (see lib/smartcube/autoReconnect.ts for the schedule): how many attempts
   * have started, and whether one is running right now. Null when not trying
   * — never set after a deliberate disconnect().
   */
  reconnect: { attempt: number; trying: boolean } | null;
  /**
   * Why there's no automatic reconnect after an unexpected drop, so the
   * connect screen can say so next to its one-tap Reconnect: the browser
   * can't reach the cube without the device chooser ("unsupported"), it
   * stopped after a few minutes of misses ("gave-up"), or the page sat in
   * the background ("hidden"). Null otherwise, including after Cancel.
   */
  reconnectStopped: "unsupported" | "gave-up" | "hidden" | null;
  /**
   * The cube came back on its own after dropping mid-solve: that attempt was
   * abandoned (the same as a drop you reconnect from by hand), and this says
   * so on the timer screen until the next solve starts or it's dismissed.
   */
  reconnectNotice: { lostMoves: number | null } | null;
  /** Stops trying to reconnect on its own. */
  cancelReconnect: () => void;
  /** Skips the rest of the current wait and tries to reconnect right now. */
  reconnectNow: () => void;
  dismissReconnectNotice: () => void;
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
/** Which cube is connected, and when and which one the link last dropped from — what decides whether a reconnect can keep the gyro's home reference. */
let connectedCubeKey: string | null = null;
let droppedCubeKey: string | null = null;
let droppedAtMs: number | null = null;
/** Set while a new gyro home is waiting for the cube to be held still (see decideGyroHome); null otherwise. */
let homeStill: StillnessDetector | null = null;
/** The gyroStore refVersion this store's own setRef calls produce, to tell them from a tap on Re-center. */
let ownRefVersion = -1;
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
  homeStill = null;
  clearSyncTimers();
}

/** Sets (or clears) the gyro home reference on this store's behalf, so the re-center watcher at the bottom can tell it from the user's. */
function setGyroHome(q: Quat | null): void {
  ownRefVersion = useGyroStore.getState().refVersion + 1;
  useGyroStore.getState().setRef(q);
}

/** What the browser can say about itself, read once after hydration (components/chrome/ClientEnv.tsx) — both values in one step so the connect screen's Reconnect button appears with the rest of it, not a beat later. */
export function detectBrowserEnv(): { supported: boolean; lastCubeName: string | null } {
  return { supported: typeof navigator !== "undefined" && "bluetooth" in navigator, lastCubeName: readLastCube() };
}

/** No attempt in progress or on screen — what cancel() leaves behind. */
const EMPTY_ATTEMPT = {
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
} satisfies Partial<SmartCubeState>;

interface TestDriver {
  connectSmartCube: typeof import("smartcube-web-bluetooth").connectSmartCube;
  /** Stands in for a silent reconnect to the remembered cube; without it, the store behaves like a browser that can't. */
  reconnect?: () => Promise<SmartCubeConnection>;
}

/**
 * A test seam: browser tests define window.__smartCubeTestDriver (same
 * connectSmartCube shape) to drive the whole solving flow with scripted
 * turns. Never set by the app itself.
 */
function testDriver(): TestDriver | undefined {
  return (globalThis as { __smartCubeTestDriver?: TestDriver }).__smartCubeTestDriver;
}

/**
 * The cube the browser's chooser last handed over. Holding on to it is what
 * makes a silent reconnect possible: device.gatt.connect() needs no click,
 * only requestDevice() does. Lost on reload (see lib/smartcube/knownDevice.ts).
 */
let knownDevice: BluetoothDevice | null = null;

/** One stretch of trying to get the cube back after it dropped. */
interface ReconnectRun {
  droppedAtMs: number;
  /** Attempts started so far. */
  attempt: number;
  trying: boolean;
  lastEndedAtMs: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  hiddenSinceMs: number | null;
  hiddenTimer: ReturnType<typeof setTimeout> | null;
  abort: AbortController | null;
  /** Ended because a connect by hand took over, which may be using this same device: leave its link alone. */
  keepLink: boolean;
  /** Undoes the listeners (page visibility, the cube's advertisements) this run added. */
  cleanups: (() => void)[];
}
let reconnectRun: ReconnectRun | null = null;

function pageHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function canListPermittedDevices(): boolean {
  if (typeof navigator === "undefined") return false;
  const bluetooth = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
  return !!bluetooth && typeof bluetooth.getDevices === "function";
}

/**
 * Ends the current run, if any, and records why there won't be another
 * automatic try (null: no reason to mention). `keepLink`: a connect by hand
 * is taking over, so an attempt still in flight mustn't drop the device's
 * link on its way out.
 */
function stopAutoReconnect(reason: SmartCubeState["reconnectStopped"], keepLink = false): void {
  const run = reconnectRun;
  reconnectRun = null;
  if (run) {
    run.keepLink = keepLink;
    if (run.timer) clearTimeout(run.timer);
    if (run.hiddenTimer) clearTimeout(run.hiddenTimer);
    run.abort?.abort();
    for (const undo of run.cleanups) undo();
  }
  const st = useSmartCubeStore.getState();
  if (st.reconnect !== null || st.reconnectStopped !== reason) useSmartCubeStore.setState({ reconnect: null, reconnectStopped: reason });
}

function scheduleReconnect(run: ReconnectRun): void {
  if (reconnectRun !== run) return;
  const delay = reconnectDelay(run.attempt, Date.now() - run.droppedAtMs);
  if (delay === null) {
    stopAutoReconnect("gave-up");
    return;
  }
  run.timer = setTimeout(() => void attemptReconnect(run), delay);
}

class NothingToReconnectTo extends Error {}

async function attemptReconnect(run: ReconnectRun): Promise<void> {
  if (reconnectRun !== run || run.trying) return;
  if (run.timer) clearTimeout(run.timer);
  run.timer = null;
  run.trying = true;
  run.attempt++;
  const abort = new AbortController();
  run.abort = abort;
  useSmartCubeStore.setState({ reconnect: { attempt: run.attempt, trying: true } });
  const device = knownDevice;
  try {
    const driver = testDriver();
    let connection: SmartCubeConnection;
    if (driver) {
      if (!driver.reconnect) throw new NothingToReconnectTo();
      connection = await driver.reconnect();
    } else {
      knownDevice ??= await findPermittedDevice(useSmartCubeStore.getState().lastCubeName);
      if (!knownDevice) throw new NothingToReconnectTo();
      connection = await connectKnownDevice(knownDevice, { signal: abort.signal });
    }
    // Cancelled (or the user connected by hand) while this was working: let it go.
    if (reconnectRun !== run) {
      if (!run.keepLink) void connection.disconnect().catch(() => {});
      return;
    }
    stopAutoReconnect(null);
    attachConnection(connection, true);
  } catch (err) {
    if (reconnectRun !== run) {
      // Cancelled mid-attempt: don't leave a half-open link behind, unless a connect by hand may be using it.
      if (!run.keepLink && !conn) {
        try {
          (knownDevice ?? device)?.gatt?.disconnect();
        } catch {
          // already gone
        }
      }
      return;
    }
    run.trying = false;
    run.abort = null;
    run.lastEndedAtMs = Date.now();
    if (err instanceof NothingToReconnectTo) {
      stopAutoReconnect("unsupported");
      return;
    }
    useSmartCubeStore.setState({ reconnect: { attempt: run.attempt, trying: false } });
    scheduleReconnect(run);
  }
}

/**
 * The link dropped on its own: keep trying to get the same cube back, on
 * lib/smartcube/autoReconnect.ts's schedule, without ever opening the
 * device chooser (that needs a click). Where that isn't possible, it says
 * so and leaves it to the connect screen's one-tap Reconnect.
 */
function startAutoReconnect(): void {
  stopAutoReconnect(null);
  const driver = testDriver();
  if (driver ? !driver.reconnect : !knownDevice && !canListPermittedDevices()) {
    useSmartCubeStore.setState({ reconnectStopped: "unsupported" });
    return;
  }
  const now = Date.now();
  const run: ReconnectRun = {
    droppedAtMs: now,
    attempt: 0,
    trying: false,
    lastEndedAtMs: null,
    timer: null,
    hiddenSinceMs: null,
    hiddenTimer: null,
    abort: null,
    keepLink: false,
    cleanups: [],
  };
  reconnectRun = run;
  useSmartCubeStore.setState({ reconnect: { attempt: 0, trying: false }, reconnectStopped: null });

  // A pocketed phone or a background tab: give it a minute, then stop
  // rather than keep the radio busy for nobody. Coming back sooner tries
  // straight away — you're probably holding the cube again.
  if (typeof document !== "undefined") {
    const onHidden = () => {
      run.hiddenSinceMs = Date.now();
      if (run.hiddenTimer) clearTimeout(run.hiddenTimer);
      run.hiddenTimer = setTimeout(() => {
        if (reconnectRun === run) stopAutoReconnect("hidden");
      }, RECONNECT_HIDDEN_LIMIT_MS);
    };
    const onVisibility = () => {
      if (reconnectRun !== run) return;
      if (pageHidden()) {
        onHidden();
        return;
      }
      if (run.hiddenTimer) clearTimeout(run.hiddenTimer);
      run.hiddenTimer = null;
      // Background timers get throttled, so the timer above may not have fired yet even when it should have.
      const tooLong = hiddenTooLong(run.hiddenSinceMs, Date.now());
      run.hiddenSinceMs = null;
      if (tooLong) stopAutoReconnect("hidden");
      else if (tryEarly(run.trying, run.lastEndedAtMs, Date.now())) void attemptReconnect(run);
    };
    if (pageHidden()) onHidden();
    document.addEventListener("visibilitychange", onVisibility);
    run.cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
  }

  // Where the browser lets the page listen for the cube's advertisements,
  // hearing it is the cue to try now instead of sitting out the backoff.
  const device = knownDevice;
  if (!driver && device && typeof device.watchAdvertisements === "function") {
    const watch = new AbortController();
    const onAdvertisement = () => {
      if (reconnectRun === run && tryEarly(run.trying, run.lastEndedAtMs, Date.now())) void attemptReconnect(run);
    };
    device.addEventListener("advertisementreceived", onAdvertisement);
    device.watchAdvertisements({ signal: watch.signal }).catch(() => {});
    run.cleanups.push(() => {
      device.removeEventListener("advertisementreceived", onAdvertisement);
      watch.abort();
    });
  }

  scheduleReconnect(run);
}

/**
 * Takes over a live connection — a fresh one from connect(), or one an
 * auto-reconnect got back (`resumed`) — and starts listening to it.
 */
function attachConnection(connection: SmartCubeConnection, resumed: boolean): void {
  const set = useSmartCubeStore.setState;
  const get = useSmartCubeStore.getState;
  conn = connection;
  // A fresh connection starts from a solved cube until the cube says
  // otherwise. Coming back from a drop keeps the app's last picture instead:
  // the cube reports its real state moments later either way, and for one
  // that can't (MoYu MHC) where it was is a better guess than solved.
  if (!resumed) {
    liveCube = newCube();
    frames = freshFrames();
  }
  caps = connection.capabilities;
  sync = newStateSync();
  gyroLog = [];
  resetLatestGyro();
  resetTimeMachine();
  // Where the gyro's home comes from: see decideGyroHome. A cube that was only
  // gone a moment keeps its frame, so the old reference is still right.
  const cubeKey = connection.deviceMAC || connection.deviceName || connection.protocol.name;
  const homeDecision = decideGyroHome({
    resumed,
    hasRef: useGyroStore.getState().ref !== null,
    sameCube: droppedCubeKey !== null && droppedCubeKey === cubeKey,
    droppedForMs: droppedAtMs === null ? null : Date.now() - droppedAtMs,
  });
  connectedCubeKey = cubeKey;
  droppedCubeKey = droppedAtMs = null;
  if (homeDecision !== "keep") setGyroHome(null);
  homeStill = homeDecision === "await-still" ? new StillnessDetector() : null;
  if (homeDecision === "await-still") set({ gyroNeedsRecenter: true });
  else if (homeDecision === "first-sample") set({ gyroNeedsRecenter: false });

  /**
   * Plays one reported turn into the live cube, the cross-colour frames and
   * the store. `announce` tells the bus consumers; it is called once the
   * state is in, and before a finishing turn disarms the attempt — so a
   * listener reading armed/recording sees the same thing it always did.
   */
  const applyTurn = (rawToken: string, ts: number, announce: () => void): void => {
    liveCube.move(rawToken);
    for (const f of CROSS_FACES) frames[f].move(relabelMove(rawToken, f));
    const facelets = liveCube.asString();

    const state = get();
    if (!state.armed) {
      set({ liveFacelets: facelets });
      announce();
      return;
    }

    // See mergesIntoDoubleTurn's own doc comment for why this merge
    // (and its time gate) exists — short version: some cubes' firmware
    // never reports an atomic 180° turn, only two 90° clicks.
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
    announce();

    if (facelets === SOLVED_FACELETS) {
      set({ armed: false, recording: false, solvedAtMs: ts });
    }
  };

  sub = connection.events$.subscribe((event: SmartCubeEvent) => {
    if (event.type === "DISCONNECT") {
      const dropped = get();
      const wasActive = dropped.armed || dropped.recording;
      droppedCubeKey = connectedCubeKey;
      droppedAtMs = Date.now();
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
        reconnectNotice: null,
      });
      teardown();
      // Not a disconnect() call (that unsubscribes before it lets go), so the link dropped on its own — go and get it back.
      startAutoReconnect();
      return;
    }
    if (event.type === "GYRO") {
      const sample = { atMs: event.timestamp, q: event.quaternion };
      emitGyro(sample);
      // First sample of a connection doubles as the home reference —
      // a best guess (the connect screen asks for the yellow-top grip)
      // that Re-center or the calibration wizard can correct any time. After
      // a reconnect that lost the old reference it waits for the cube to be
      // held still instead, since the cube is likely mid-regrip right then.
      if (!useGyroStore.getState().ref) {
        if (!homeStill || homeStill.push(sample)) {
          homeStill = null;
          setGyroHome(sample.q);
        }
      } else {
        homeStill = null;
      }
      if (!get().gyroActive) set({ gyroActive: true });
      // Capped (~10 min at 50Hz) so an armed-and-forgotten cube can't grow it without bound — by
      // thinning the old wait, never by dropping the solve (see appendGyroSample).
      const st = get();
      if (st.armed || st.recording) gyroLog = appendGyroSample(gyroLog, sample, st.recording ? st.startedAtMs : null);
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
          // for us the way it normally does after every turn. The lost turn
          // is what solved it, so it happened about one turn after the last
          // one we have, not at that last turn's time (see lostTurnTimeMs).
          const completesSolve = fix === SOLVED_FACELETS && st.recording;
          const solvedAt = completesSolve ? lostTurnTimeMs(st.moves.map((m) => m.timeStampMs), event.timestamp) : event.timestamp;
          const milestones = completesSolve ? advanceMilestones(pickMilestones(st), liveCube, (f) => frames[f], solvedAt) : {};
          set({
            ...milestones,
            liveFacelets: fix,
            stateSource: "cube",
            // Only a solve under way has turns that no longer add up: while merely armed (inspection) nothing is recorded yet, and the flow drops the attempt if the cube is no longer on the scramble.
            ...(st.recording ? { correctedDuringSolve: true } : {}),
          });
          if (completesSolve) set({ armed: false, recording: false, solvedAtMs: solvedAt });
        }, SETTLE_MS);
      }
      return;
    }
    if (event.type !== "MOVE") return;

    // See correctBurstTimestamp's own comment: several turns can arrive
    // in one Bluetooth notification sharing a single host timestamp —
    // this recovers their real spacing from the cube's own hardware
    // clock where the protocol provides one, anchored back from the
    // notification's arrival (no turn can be later than that).
    burstState = correctBurstTimestamp(burstState, { timestamp: event.timestamp, cubeTimestamp: event.cubeTimestamp, arrivalMs: event.timestamp });
    const ts = burstState.correctedTimestamp;

    onTurn(sync);
    if (idleTimer) clearTimeout(idleTimer);
    // Once the turning stops (between solves), check the app's picture against the cube's own.
    idleTimer = setTimeout(() => {
      if (caps?.facelets && !get().recording) void conn?.sendCommand({ type: "REQUEST_FACELETS" }).catch(() => {});
    }, IDLE_CHECK_MS);

    // Apply the turn to the app's picture of the cube first, then tell the
    // consumers: a bus listener (or the Time Machine) that fails must never be
    // able to cost the cube this turn — that desyncs it for the rest of the
    // solve. The bus swallows listener errors itself; the finally covers
    // anything else going wrong on the way, so the turn is always announced.
    let announced = false;
    const announce = () => {
      if (announced) return;
      announced = true;
      emitRawMove({ token: event.move, timeStampMs: ts });
      recordTimeMachineMove(event.move, ts);
    };
    try {
      applyTurn(event.move, ts, announce);
    } finally {
      announce();
    }
  });

  writeLastCube(connection.deviceName || null);
  const before = get();
  set({
    lastCubeName: connection.deviceName || null,
    connectStatus: null,
    macRequest: null,
    connected: true,
    connecting: false,
    deviceName: connection.deviceName || connection.protocol.name,
    protocolName: connection.protocol.name,
    deviceMac: connection.deviceMAC || null,
    liveFacelets: resumed ? liveCube.asString() : SOLVED_FACELETS,
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
    reconnect: null,
    reconnectStopped: null,
    // Back on its own after dropping mid-solve: that attempt is over (the
    // drop already disarmed it), so clear it out and say why on screen —
    // the same outcome as reconnecting by hand, just without the trip
    // through the connect screen. A drop between solves leaves the last
    // solve's recap alone.
    ...(resumed && before.droppedMidSolve ? { ...EMPTY_ATTEMPT, reconnectNotice: { lostMoves: before.droppedMidSolveMoves } } : {}),
  });
  if (connection.capabilities.battery) {
    get().refreshBattery();
    batteryPollTimer = setInterval(() => get().refreshBattery(), BATTERY_POLL_MS);
  }
  // Ask where every piece is right now — the connect-time report can go out before this subscription existed.
  if (connection.capabilities.facelets) void connection.sendCommand({ type: "REQUEST_FACELETS" }).catch(() => {});
  if (connection.capabilities.hardware) void connection.sendCommand({ type: "REQUEST_HARDWARE" }).catch(() => {});
}

export const useSmartCubeStore = create<SmartCubeState>((set, get) => ({
  // Both read from the browser, so they start unknown (supported: null) and are filled in together after hydration (components/chrome/ClientEnv.tsx) — reading them here would make the server's HTML and the client's first render disagree.
  supported: null,
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
  gyroNeedsRecenter: false,
  reconnect: null,
  reconnectStopped: null,
  reconnectNotice: null,

  cancelReconnect: () => stopAutoReconnect(null),

  reconnectNow: () => {
    if (reconnectRun) void attemptReconnect(reconnectRun);
  },

  dismissReconnectNotice: () => set({ reconnectNotice: null }),

  recenterGyro: () => {
    const ok = useGyroStore.getState().recenter();
    if (ok) set({ gyroNeedsRecenter: false });
    return ok;
  },

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
    knownDevice = null;
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
    // Picking a cube by hand supersedes trying to get the old one back on its own.
    stopAutoReconnect(null, true);
    set({ connecting: true, error: null, connectStatus: null, macRequest: null, reconnectNotice: null });
    try {
      const { connectSmartCube } = testDriver() ?? (await import("smartcube-web-bluetooth"));
      // enableAddressSearch lets MoYu32/QiYi cubes resolve their AES MAC
      // address from a bounded set of candidates when the advertisement
      // itself doesn't hand it over. When even that fails (Chrome without
      // advertisement access can't read a GAN cube's address at all), the
      // library asks for it — the address prompt answers.
      // The chooser's pick is kept so a later drop can be reconnected without it.
      const { value: connection, device } = await captureChosenDevice(() => connectSmartCube({
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
      }));
      // Cancelled while it was still working: don't let it connect after the fact.
      if (attempt !== connectAttempt) {
        void connection.disconnect().catch(() => {});
        return;
      }
      if (device) knownDevice = device;
      attachConnection(connection, false);
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
    // Stop listening before letting go, so the DISCONNECT this causes can't be mistaken for the link dropping on its own.
    const leaving = conn;
    teardown();
    void leaving?.disconnect().catch(() => {});
    stopAutoReconnect(null);
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
      reconnectNotice: null,
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
      reconnectNotice: null,
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

// Any re-center that isn't this store's own guess (the Re-center button, a cube
// gesture, the calibration wizard) is someone confirming the home pose.
useGyroStore.subscribe((state, prev) => {
  if (state.refVersion === prev.refVersion || state.refVersion === ownRefVersion) return;
  if (useSmartCubeStore.getState().gyroNeedsRecenter) useSmartCubeStore.setState({ gyroNeedsRecenter: false });
});
