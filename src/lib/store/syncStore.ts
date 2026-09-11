"use client";

import { create } from "zustand";
import { exportSyncPayload, mergeSyncPayload, type SyncPayload } from "@/lib/db/sync";
import { useSessionStore } from "@/lib/store/sessionStore";

/**
 * Cross-device sync over a direct WebRTC data channel — no account, no
 * server we run, exactly the same no-signaling-server handshake raceStore.ts
 * already uses for live racing (see there for why this is safe without a
 * backend). Once connected, both sides just dump their entire session/solve
 * history at each other and merge in whatever the other side has that this
 * one doesn't — additive only, see lib/db/sync.ts.
 */

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const ICE_GATHER_TIMEOUT_MS = 6000;
/** Characters per data-channel message — comfortably under every browser's per-message limit. */
const CHUNK_SIZE = 12000;

type WireMessage =
  | { t: "payloadMeta"; chunks: number }
  | { t: "payloadChunk"; i: number; data: string }
  | { t: "payloadDone" };

export type SyncMode = "idle" | "hosting" | "joining";
export type SyncPhase = "lobby" | "syncing" | "done";

interface SyncStoreState {
  mode: SyncMode;
  busy: boolean;
  error: string | null;
  localCode: string | null;
  connected: boolean;
  phase: SyncPhase;
  sentPct: number;
  receivedPct: number;
  result: { addedSessions: number; addedSolves: number } | null;

  startHosting: () => Promise<void>;
  startJoining: () => void;
  submitOfferCode: (code: string) => Promise<void>;
  submitAnswerCode: (code: string) => Promise<void>;
  disconnect: () => void;
  reset: () => void;
}

let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let incomingChunks: string[] = [];
let expectedChunks = 0;

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

async function sendPayload(payload: SyncPayload, onProgress: (pct: number) => void): Promise<void> {
  const json = JSON.stringify(payload);
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) chunks.push(json.slice(i, i + CHUNK_SIZE));

  send({ t: "payloadMeta", chunks: chunks.length });
  for (let i = 0; i < chunks.length; i++) {
    send({ t: "payloadChunk", i, data: chunks[i] });
    onProgress(Math.round(((i + 1) / chunks.length) * 100));
    // A tiny yield between sends so a large history doesn't flood the data
    // channel's send buffer faster than the browser can drain it.
    await new Promise((r) => setTimeout(r, 4));
  }
  send({ t: "payloadDone" });
}

function teardown(): void {
  dc?.close();
  pc?.close();
  dc = null;
  pc = null;
  incomingChunks = [];
  expectedChunks = 0;
}

const IDLE_STATE = {
  mode: "idle" as SyncMode,
  busy: false,
  localCode: null,
  connected: false,
  phase: "lobby" as SyncPhase,
  sentPct: 0,
  receivedPct: 0,
  result: null,
};

export const useSyncStore = create<SyncStoreState>((set) => {
  function wireDataChannel(channel: RTCDataChannel) {
    dc = channel;
    channel.onopen = () => {
      set({ connected: true, busy: false, error: null, phase: "syncing" });
      void exportSyncPayload().then((payload) => sendPayload(payload, (sentPct) => set({ sentPct })));
    };
    channel.onclose = () => set({ connected: false });
    channel.onmessage = (event) => {
      let msg: WireMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === "payloadMeta") {
        incomingChunks = new Array(msg.chunks);
        expectedChunks = msg.chunks;
        set({ receivedPct: 0 });
      } else if (msg.t === "payloadChunk") {
        incomingChunks[msg.i] = msg.data;
        const received = incomingChunks.filter((c) => c !== undefined).length;
        set({ receivedPct: expectedChunks > 0 ? Math.round((received / expectedChunks) * 100) : 0 });
      } else if (msg.t === "payloadDone") {
        void (async () => {
          try {
            const payload = JSON.parse(incomingChunks.join("")) as SyncPayload;
            const result = await mergeSyncPayload(payload);
            await useSessionStore.getState().refreshFromDb();
            set({ result, phase: "done" });
          } catch (err) {
            set({ error: err instanceof Error ? err.message : "Couldn't read the other device's data." });
          }
        })();
      }
    };
  }

  return {
    ...IDLE_STATE,
    error: null,

    startHosting: async () => {
      teardown();
      set({ ...IDLE_STATE, mode: "hosting", busy: true, error: null });
      try {
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        wireDataChannel(conn.createDataChannel("sync"));
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        await waitForIceGatheringComplete(conn);
        set({ localCode: encode(conn.localDescription!), busy: false });
      } catch (err) {
        set({ busy: false, error: err instanceof Error ? err.message : String(err) });
      }
    },

    startJoining: () => set({ ...IDLE_STATE, mode: "joining" }),

    submitOfferCode: async (code) => {
      teardown();
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

    disconnect: () => {
      teardown();
      set({ ...IDLE_STATE, error: null });
    },

    reset: () => {
      teardown();
      set({ ...IDLE_STATE, error: null });
    },
  };
});
