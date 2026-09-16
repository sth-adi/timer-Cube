"use client";

import { create } from "zustand";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { createRaceRoom, deleteRaceRoom, fetchRaceRoomOffer, submitRaceRoomAnswer, waitForRaceRoomAnswer } from "@/lib/social/raceSignaling";

/**
 * Live head-to-head racing over a direct WebRTC data channel. The race
 * itself — scramble, ready-up, times, moves — always goes straight between
 * the two browsers over that data channel, never through anything we run.
 *
 * The one piece two browsers can never do unassisted is finding each other
 * in the first place (WebRTC needs *some* side channel to swap a
 * connection "offer" and "answer"). The quick-connect path (hostQuick/
 * joinQuick) uses this app's Supabase project as a short-lived mailbox for
 * exactly that handshake — a 5-character room code instead of a giant
 * blob to copy/paste — see lib/social/raceSignaling.ts; the room is
 * deleted the moment the host completes the connection. If Supabase isn't
 * configured, startHosting/submitOfferCode/submitAnswerCode are the manual
 * fallback: the same handshake with the offer/answer copy-pasted by hand
 * through whatever channel the racers already have open.
 *
 * Either way, a public STUN server (Google's, the same one nearly every
 * WebRTC demo and library defaults to) is used only so each side can
 * discover its own public address for the eventual direct connection.
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
  /** The blob you share with your opponent — your offer (host) or your answer (joiner). Manual-flow fallback only; the quick-connect path never shows this unless it fails. */
  localCode: string | null;
  /** The short code shown to the host once a quick-connect room is up, or typed in by the joiner. Null while using the manual fallback. */
  roomCode: string | null;
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
  /** Quick-connect: generates the offer, publishes it under a fresh room code, and waits for a joiner's answer to arrive — no manual code exchange at all. Falls back to leaving `error` set (the manual flow underneath is unaffected) if Supabase isn't reachable. */
  hostQuick: () => Promise<void>;
  /** Quick-connect: looks up the room by code, answers it, and hands the answer back through the same room. */
  joinQuick: (code: string) => Promise<void>;
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
let roomAbort: AbortController | null = null;

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
      set({ connected: true, busy: false, error: null, roomCode: null });
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
    roomAbort?.abort();
    roomAbort = null;
  }

  return {
    mode: "idle",
    busy: false,
    error: null,
    localCode: null,
    roomCode: null,
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

    hostQuick: async () => {
      teardown();
      isHost = true;
      const abort = new AbortController();
      roomAbort = abort;
      set({ mode: "hosting", busy: true, error: null, localCode: null, roomCode: null });
      try {
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        wireDataChannel(conn.createDataChannel("race"));
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        await waitForIceGatheringComplete(conn);
        const scramble = await getCubeEngineClient().generateScramble();
        const offerCode = encode(conn.localDescription!);
        const code = await createRaceRoom(offerCode);
        if (!code) {
          // No Supabase (or it's unreachable) — fall back to the manual code, same as startHosting.
          set({ localCode: offerCode, scramble, busy: false, error: "Couldn't create a quick room — use the code below instead." });
          return;
        }
        // Keep the manual offer code around too (unused unless the quick-connect wait fails or the racer opts into the fallback UI).
        set({ roomCode: code, localCode: offerCode, scramble, busy: false });
        const answer = await waitForRaceRoomAnswer(code, abort.signal);
        if (abort.signal.aborted || !pc) return;
        if (!answer) {
          set({ error: "Nobody joined in time — try hosting again.", roomCode: null });
          return;
        }
        await pc.setRemoteDescription(decode(answer));
        void deleteRaceRoom(code);
      } catch (err) {
        set({ busy: false, error: err instanceof Error ? err.message : String(err) });
      }
    },

    joinQuick: async (code) => {
      teardown();
      isHost = false;
      const abort = new AbortController();
      roomAbort = abort;
      const normalized = code.trim().toUpperCase();
      set({ mode: "joining", busy: true, error: null, localCode: null, roomCode: normalized });
      try {
        const offer = await fetchRaceRoomOffer(normalized);
        if (abort.signal.aborted) return;
        if (!offer) {
          set({ busy: false, roomCode: null, error: "That room code wasn't found — check it and try again." });
          return;
        }
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        conn.ondatachannel = (event) => wireDataChannel(event.channel);
        await conn.setRemoteDescription(decode(offer));
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        await waitForIceGatheringComplete(conn);
        await submitRaceRoomAnswer(normalized, encode(conn.localDescription!));
        set({ busy: false });
      } catch (err) {
        set({ busy: false, roomCode: null, error: err instanceof Error ? err.message : "Couldn't join that room." });
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
        roomCode: null,
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
        roomCode: null,
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
