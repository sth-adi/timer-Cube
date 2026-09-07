import { create } from "zustand";
import type { Session, Solve } from "@/types";
import { ensureDefaultSession } from "@/lib/db/db";
import { createSession, listSessions, renameSession, deleteSession } from "@/lib/db/sessions";
import { addSolve, deleteSolve, updateSolve, getSessionSolves, importSolves } from "@/lib/db/solves";
import type { Penalty } from "@/types";
import { computeSessionStats } from "@/lib/stats/stats";
import { buildSessionExport, downloadJson, parseSessionExport } from "@/lib/utils/sessionExport";

export type PBKind = "single" | "ao5" | "ao12";
export interface PBEvent {
  kind: PBKind;
  ms: number;
  id: number;
}

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  solves: Solve[];
  loaded: boolean;
  lastPB: PBEvent | null;
  init: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  addSession: (name: string) => Promise<void>;
  renameActiveSession: (name: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  recordSolve: (timeMs: number, scramble: string) => Promise<void>;
  setPenalty: (solveId: string, penalty: Penalty) => Promise<void>;
  setComment: (solveId: string, comment: string) => Promise<void>;
  removeSolve: (solveId: string) => Promise<void>;
  clearPB: () => void;
  exportActiveSession: () => void;
  importIntoActiveSession: (json: string) => Promise<number>;
}

let pbEventId = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  solves: [],
  loaded: false,
  lastPB: null,

  init: async () => {
    const first = await ensureDefaultSession();
    const sessions = await listSessions();
    const solves = await getSessionSolves(first.id);
    set({ sessions, activeSessionId: first.id, solves, loaded: true });
  },

  switchSession: async (id) => {
    const solves = await getSessionSolves(id);
    set({ activeSessionId: id, solves });
  },

  addSession: async (name) => {
    const session = await createSession(name);
    const sessions = await listSessions();
    set({ sessions, activeSessionId: session.id, solves: [] });
  },

  renameActiveSession: async (name) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    await renameSession(activeSessionId, name);
    set({ sessions: await listSessions() });
  },

  removeSession: async (id) => {
    await deleteSession(id);
    const sessions = await listSessions();
    const active = get().activeSessionId;
    if (active === id) {
      const fallback = sessions[0] ?? (await ensureDefaultSession());
      const solves = await getSessionSolves(fallback.id);
      set({ sessions: await listSessions(), activeSessionId: fallback.id, solves });
    } else {
      set({ sessions });
    }
  },

  recordSolve: async (timeMs, scramble) => {
    const { activeSessionId, solves: prevSolves } = get();
    if (!activeSessionId) return;
    const prevStats = computeSessionStats(prevSolves);

    await addSolve({ sessionId: activeSessionId, timeMs, scramble });
    const solves = await getSessionSolves(activeSessionId);
    const newStats = computeSessionStats(solves);

    let pb: PBEvent | null = null;
    if (newStats.bestAo12 !== null && (prevStats.bestAo12 === null || newStats.bestAo12 < prevStats.bestAo12)) {
      pb = { kind: "ao12", ms: newStats.bestAo12, id: ++pbEventId };
    } else if (newStats.bestAo5 !== null && (prevStats.bestAo5 === null || newStats.bestAo5 < prevStats.bestAo5)) {
      pb = { kind: "ao5", ms: newStats.bestAo5, id: ++pbEventId };
    } else if (
      prevStats.best !== null &&
      newStats.best !== null &&
      newStats.best < prevStats.best
    ) {
      pb = { kind: "single", ms: newStats.best, id: ++pbEventId };
    }

    set({ solves, lastPB: pb });
  },

  setPenalty: async (solveId, penalty) => {
    await updateSolve(solveId, { penalty });
    const { activeSessionId } = get();
    if (activeSessionId) set({ solves: await getSessionSolves(activeSessionId) });
  },

  setComment: async (solveId, comment) => {
    await updateSolve(solveId, { comment });
    const { activeSessionId } = get();
    if (activeSessionId) set({ solves: await getSessionSolves(activeSessionId) });
  },

  removeSolve: async (solveId) => {
    await deleteSolve(solveId);
    const { activeSessionId } = get();
    if (activeSessionId) set({ solves: await getSessionSolves(activeSessionId) });
  },

  clearPB: () => set({ lastPB: null }),

  exportActiveSession: () => {
    const { activeSessionId, sessions, solves } = get();
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const data = buildSessionExport(session.name, solves);
    const datePart = new Date().toISOString().slice(0, 10);
    downloadJson(`${session.name.replace(/[^a-z0-9]+/gi, "-")}-${datePart}.json`, data);
  },

  importIntoActiveSession: async (json) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return 0;
    const parsed = parseSessionExport(JSON.parse(json));
    const count = await importSolves(activeSessionId, parsed);
    set({ solves: await getSessionSolves(activeSessionId) });
    return count;
  },
}));
