"use client";

import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";

/**
 * Live head-to-head racing over a direct WebRTC data channel — no signaling
 * server, no account system, nothing running on our end at all. The two
 * browsers exchange a single connection "code" each (their WebRTC offer/
 * answer, base64-encoded) through whatever channel the racers already have
 * open — text, Discord, reading it aloud — then talk directly to each other
 * over the internet from then on. A public STUN server (Google's, the same
 * one nearly every WebRTC demo and library defaults to) is used only so
 * each side can discover its own public address; no cube data, times, or
 * anything else passes through it.
 *
 * If a side has a smart cube connected, its moves stream over the same data
 * channel (see the "move" WireMessage) so the other side can render a live
 * LiveCubeMimic of it — see RaceMode.tsx, which owns arming/reading the
 * local smartCubeStore and relaying it here; this store just carries the
 * bytes and the already-relayed opponentMoves for whoever's watching.
 */

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const ICE_GATHER_TIMEOUT_MS = 6000;
const COUNTDOWN_MS = 3000;

/** Wire shape for a relayed smart-cube move — same fields as smartCubeStore's own SmartCubeMove, kept independent so raceStore never has to import that store's types. */
export interface RaceCubeMove {
  token: string;
  timeStampMs: number;
}

type WireMessage =
  | { t: "scramble"; scramble: string }
  | { t: "ready"; ready: boolean }
  | { t: "start"; atMs: number }
  | { t: "finished"; timeMs: number }
  | { t: "hasCube"; hasCube: boolean }
  | { t: "move"; token: string; timeStampMs: number };

export type RaceMode = "idle" | "hosting" | "joining";
export type RaceState = "lobby" | "countdown" | "running" | "finished";

interface RaceStoreState {
  mode: RaceMode;
  busy: boolean;
  error: string | null;
  /** The blob you share with your opponent — your offer (host) or your answer (joiner). */
  localCode: string | null;
  connected: boolean;
  scramble: string | null;
  myReady: boolean;
  opponentReady: boolean;
  startAtMs: number | null;
  raceState: RaceState;
  myTimeMs: number | null;
  opponentTimeMs: number | null;
  /** Whether a connected smart cube is driving this device's side of the race — reported the moment RaceMode knows, so the other side can decide whether to render a live cube visual or just a timer. */
  myHasSmartCube: boolean;
  opponentHasSmartCube: boolean;
  /** Every move the opponent's smart cube has reported so far this attempt — feeds a LiveCubeMimic on this side, same shape it already consumes locally in SmartCubeTimer. */
  opponentMoves: RaceCubeMove[];

  startHosting: () => Promise<void>;
  startJoining: () => void;
  submitOfferCode: (code: string) => Promise<void>;
  submitAnswerCode: (code: string) => Promise<void>;
  setReady: (ready: boolean) => void;
  finish: (timeMs: number) => void;
  rematch: () => Promise<void>;
  disconnect: () => void;
  reset: () => void;
  setMyHasSmartCube: (hasCube: boolean) => void;
  reportMove: (token: string, timeStampMs: number) => void;
}

let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let isHost = false;

function encode(desc: RTCSessionDescriptionInit): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(desc))));
}

function decode(code: string): RTCSessionDescriptionInit {
  return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
}

function waitForIceGatheringComplete(conn: RTCPeerConnection): Promise<void> {
  if (conn.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      conn.removeEventListener("icegatheringstatechange", done);
      clearTimeout(timeoutId);
      resolve();
    };
    conn.addEventListener("icegatheringstatechange", () => {
      if (conn.iceGatheringState === "complete") done();
    });
    const timeoutId = window.setTimeout(done, ICE_GATHER_TIMEOUT_MS);
  });
}

function send(message: WireMessage): void {
  if (dc?.readyState === "open") dc.send(JSON.stringify(message));
}

export const useRaceStore = create<RaceStoreState>((set, get) => {
  function wireDataChannel(channel: RTCDataChannel) {
    dc = channel;
    channel.onopen = () => {
      set({ connected: true, busy: false, error: null });
      // The host is the one who picked the scramble (during startHosting,
      // before the joiner even existed) — hand it over now that there's
      // finally a channel to send it on.
      if (isHost) {
        const { scramble } = get();
        if (scramble) send({ t: "scramble", scramble });
      }
    };
    channel.onclose = () => set({ connected: false });
    channel.onmessage = (event) => {
      let msg: WireMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === "scramble") {
        set({
          scramble: msg.scramble,
          myReady: false,
          opponentReady: false,
          startAtMs: null,
          raceState: "lobby",
          myTimeMs: null,
          opponentTimeMs: null,
          opponentMoves: [],
        });
      } else if (msg.t === "ready") {
        set({ opponentReady: msg.ready });
        maybeStartRace();
      } else if (msg.t === "start") {
        scheduleCountdown(msg.atMs);
      } else if (msg.t === "finished") {
        set({ opponentTimeMs: msg.timeMs });
        const { myTimeMs } = get();
        if (myTimeMs !== null) set({ raceState: "finished" });
      } else if (msg.t === "hasCube") {
        set({ opponentHasSmartCube: msg.hasCube });
      } else if (msg.t === "move") {
        set((s) => ({ opponentMoves: [...s.opponentMoves, { token: msg.token, timeStampMs: msg.timeStampMs }] }));
      }
    };
  }

  function scheduleCountdown(atMs: number) {
    set({ startAtMs: atMs, raceState: "countdown" });
    const delay = Math.max(0, atMs - Date.now());
    window.setTimeout(() => {
      if (get().raceState === "countdown") set({ raceState: "running" });
    }, delay);
  }

  function maybeStartRace() {
    if (!isHost) return;
    const { myReady, opponentReady, raceState } = get();
    if (myReady && opponentReady && raceState === "lobby") {
      const atMs = Date.now() + COUNTDOWN_MS;
      send({ t: "start", atMs });
      scheduleCountdown(atMs);
    }
  }

  function teardown() {
    dc?.close();
    pc?.close();
    dc = null;
    pc = null;
    isHost = false;
  }

  return {
    mode: "idle",
    busy: false,
    error: null,
    localCode: null,
    connected: false,
    scramble: null,
    myReady: false,
    opponentReady: false,
    startAtMs: null,
    raceState: "lobby",
    myTimeMs: null,
    opponentTimeMs: null,
    myHasSmartCube: false,
    opponentHasSmartCube: false,
    opponentMoves: [],

    startHosting: async () => {
      teardown();
      isHost = true;
      set({ mode: "hosting", busy: true, error: null, localCode: null });
      try {
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        wireDataChannel(conn.createDataChannel("race"));
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        await waitForIceGatheringComplete(conn);
        const scramble = await getCubeEngineClient().generateScramble();
        set({ localCode: encode(conn.localDescription!), scramble, busy: false });
      } catch (err) {
        set({ busy: false, error: err instanceof Error ? err.message : String(err) });
      }
    },

    startJoining: () => set({ mode: "joining", error: null, localCode: null }),

    submitOfferCode: async (code) => {
      teardown();
      isHost = false;
      set({ busy: true, error: null });
      try {
        const offer = decode(code);
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        conn.ondatachannel = (event) => wireDataChannel(event.channel);
        await conn.setRemoteDescription(offer);
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        await waitForIceGatheringComplete(conn);
        set({ localCode: encode(conn.localDescription!), busy: false });
      } catch {
        set({ busy: false, error: "That code didn't work — double check it was copied in full." });
      }
    },

    submitAnswerCode: async (code) => {
      if (!pc) return;
      set({ busy: true, error: null });
      try {
        const answer = decode(code);
        await pc.setRemoteDescription(answer);
        set({ busy: false });
      } catch (err) {
        set({ busy: false, error: err instanceof Error ? err.message : "That code didn't work." });
      }
    },

    setReady: (ready) => {
      set({ myReady: ready });
      send({ t: "ready", ready });
      maybeStartRace();
    },

    finish: (timeMs) => {
      set({ myTimeMs: timeMs });
      send({ t: "finished", timeMs });
      const { opponentTimeMs } = get();
      if (opponentTimeMs !== null) set({ raceState: "finished" });
    },

    rematch: async () => {
      if (!isHost) return;
      const scramble = await getCubeEngineClient().generateScramble();
      set({
        scramble,
        myReady: false,
        opponentReady: false,
        startAtMs: null,
        raceState: "lobby",
        myTimeMs: null,
        opponentTimeMs: null,
        opponentMoves: [],
      });
      send({ t: "scramble", scramble });
    },

    disconnect: () => {
      teardown();
      set({
        mode: "idle",
        busy: false,
        localCode: null,
        connected: false,
        scramble: null,
        myReady: false,
        opponentReady: false,
        startAtMs: null,
        raceState: "lobby",
        myTimeMs: null,
        opponentTimeMs: null,
        myHasSmartCube: false,
        opponentHasSmartCube: false,
        opponentMoves: [],
      });
    },

    reset: () => {
      teardown();
      set({
        mode: "idle",
        busy: false,
        error: null,
        localCode: null,
        connected: false,
        scramble: null,
        myReady: false,
        opponentReady: false,
        startAtMs: null,
        raceState: "lobby",
        myTimeMs: null,
        opponentTimeMs: null,
        myHasSmartCube: false,
        opponentHasSmartCube: false,
        opponentMoves: [],
      });
    },

    setMyHasSmartCube: (hasCube) => {
      set({ myHasSmartCube: hasCube });
      send({ t: "hasCube", hasCube });
    },

    reportMove: (token, timeStampMs) => {
      send({ t: "move", token, timeStampMs });
    },
  };
});
