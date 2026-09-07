import { create } from "zustand";
import type { Session, Solve } from "@/types";
import { ensureDefaultSession } from "@/lib/db/db";
import { createSession, listSessions, renameSession, deleteSession } from "@/lib/db/sessions";
import { addSolve, deleteSolve, updateSolve, getSessionSolves } from "@/lib/db/solves";
import type { Penalty } from "@/types";

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  solves: Solve[];
  loaded: boolean;
  init: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  addSession: (name: string) => Promise<void>;
  renameActiveSession: (name: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  recordSolve: (timeMs: number, scramble: string) => Promise<void>;
  setPenalty: (solveId: string, penalty: Penalty) => Promise<void>;
  setComment: (solveId: string, comment: string) => Promise<void>;
  removeSolve: (solveId: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  solves: [],
  loaded: false,

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
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    await addSolve({ sessionId: activeSessionId, timeMs, scramble });
    set({ solves: await getSessionSolves(activeSessionId) });
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
}));
