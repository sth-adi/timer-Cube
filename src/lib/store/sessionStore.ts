import { create } from "zustand";
import type { Session, Solve } from "@/types";
import { ensureDefaultSession } from "@/lib/db/db";
import { createSession, listSessions, renameSession, deleteSession } from "@/lib/db/sessions";
import { addSolve, deleteSolve, updateSolve, getSessionSolves, getAllSolves, importSolves } from "@/lib/db/solves";
import { deleteRemoteSolve, deleteRemoteSession } from "@/lib/db/cloudSync";
import type { EventTag, Penalty, WcaEvent } from "@/types";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { computeAchievements, computeSessionStats, normalSolves, type AchievementState } from "@/lib/stats/stats";
import { buildSessionExport, downloadJson, parseSessionExport, type SessionExport } from "@/lib/utils/sessionExport";

export type PBKind = "single" | "ao5" | "ao12";
export interface PBEvent {
  kind: PBKind;
  ms: number;
  id: number;
}

export interface AchievementToastEvent {
  id: string;
  label: string;
  icon: string;
  toastId: number;
}

let achievementToastId = 0;

function findNewlyUnlocked(before: AchievementState[], after: AchievementState[]): AchievementState[] {
  const beforeUnlocked = new Set(before.filter((a) => a.unlocked).map((a) => a.id));
  return after.filter((a) => a.unlocked && !beforeUnlocked.has(a.id));
}

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  solves: Solve[];
  /** Every solve across every session — powers lifetime achievements/streaks/goals. */
  allSolves: Solve[];
  loaded: boolean;
  lastPB: PBEvent | null;
  achievementToast: AchievementToastEvent | null;
  init: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  addSession: (name: string, event?: WcaEvent) => Promise<void>;
  renameActiveSession: (name: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  recordSolve: (
    timeMs: number,
    scramble: string,
    splits?: number[],
    event?: EventTag,
    reconstruction?: string,
    heartRate?: { avg: number; max: number },
    crossMs?: number,
    moveTimestamps?: number[],
  ) => Promise<void>;
  setPenalty: (solveId: string, penalty: Penalty) => Promise<void>;
  setComment: (solveId: string, comment: string) => Promise<void>;
  saveReconstruction: (solveId: string, reconstruction: string) => Promise<void>;
  /** Practice category the next timed solve will be tagged with; sticky until changed, not persisted. */
  pendingEvent: EventTag | null;
  setPendingEvent: (event: EventTag | null) => void;
  removeSolve: (solveId: string) => Promise<void>;
  clearPB: () => void;
  clearAchievementToast: () => void;
  exportActiveSession: () => void;
  importIntoActiveSession: (json: string) => Promise<number>;
  importRowsIntoActiveSession: (rows: SessionExport["solves"]) => Promise<number>;
  /** Re-reads sessions/solves straight from Dexie without touching which session is active — for when something outside this store's own actions wrote to the db directly (device sync). */
  refreshFromDb: () => Promise<void>;
  /**
   * A device-to-device or cloud sync merges in whatever sessions/solves the
   * other side has under *their own* ids — never the id of this device's own
   * auto-created default session (see ensureDefaultSession in db.ts) — so a
   * first sync leaves this device looking at its own still-empty "Session 1"
   * while the solves that just arrived sit under a same-named session it
   * isn't viewing. Only fires when the active session has nothing in it yet,
   * so it can never yank a session out from under solves someone's already
   * recorded here; picks whichever other session now has the most solves.
   */
  adoptSyncedSessionIfLocalEmpty: () => Promise<void>;
}

let pbEventId = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  solves: [],
  allSolves: [],
  loaded: false,
  lastPB: null,
  achievementToast: null,
  pendingEvent: null,

  init: async () => {
    const first = await ensureDefaultSession();
    const sessions = await listSessions();
    const solves = await getSessionSolves(first.id);
    const allSolves = await getAllSolves();
    set({ sessions, activeSessionId: first.id, solves, allSolves, loaded: true });
    void useScrambleStore.getState().setEvent(first.event);
  },

  switchSession: async (id) => {
    const solves = await getSessionSolves(id);
    set({ activeSessionId: id, solves });
    const session = get().sessions.find((s) => s.id === id);
    if (session) void useScrambleStore.getState().setEvent(session.event);
  },

  addSession: async (name, event) => {
    const session = await createSession(name, event);
    const sessions = await listSessions();
    set({ sessions, activeSessionId: session.id, solves: [] });
    void useScrambleStore.getState().setEvent(session.event);
  },

  renameActiveSession: async (name) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    await renameSession(activeSessionId, name);
    set({ sessions: await listSessions() });
  },

  removeSession: async (id) => {
    await deleteSession(id);
    void deleteRemoteSession(id);
    const sessions = await listSessions();
    const active = get().activeSessionId;
    const allSolves = await getAllSolves();
    if (active === id) {
      const fallback = sessions[0] ?? (await ensureDefaultSession());
      const solves = await getSessionSolves(fallback.id);
      set({ sessions: await listSessions(), activeSessionId: fallback.id, solves, allSolves });
    } else {
      set({ sessions, allSolves });
    }
  },

  recordSolve: async (timeMs, scramble, splits, event, reconstruction, heartRate, crossMs, moveTimestamps) => {
    const { activeSessionId, solves: prevSolves, allSolves: prevAllSolves } = get();
    if (!activeSessionId) return;
    // PB detection and achievements only ever look at ordinary 2-handed
    // solves — see normalSolves() — so tagging a solve OH/feet/BLD never
    // triggers a PB toast or unlocks a milestone that assumes normal timing,
    // and never corrupts the running normal average either.
    const prevStats = computeSessionStats(normalSolves(prevSolves));
    const prevAchievements = computeAchievements(normalSolves(prevAllSolves));

    await addSolve({
      sessionId: activeSessionId,
      timeMs,
      scramble,
      splits,
      event: event ?? undefined,
      reconstruction,
      heartRate,
      crossMs,
      moveTimestamps,
    });
    const solves = await getSessionSolves(activeSessionId);
    const allSolves = await getAllSolves();
    const newStats = computeSessionStats(normalSolves(solves));
    const newAchievements = computeAchievements(normalSolves(allSolves));

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

    const newlyUnlocked = findNewlyUnlocked(prevAchievements, newAchievements);
    const achievementToast: AchievementToastEvent | null = newlyUnlocked[0]
      ? { id: newlyUnlocked[0].id, label: newlyUnlocked[0].label, icon: newlyUnlocked[0].icon, toastId: ++achievementToastId }
      : null;

    set({ solves, allSolves, lastPB: pb, achievementToast });
  },

  setPenalty: async (solveId, penalty) => {
    await updateSolve(solveId, { penalty });
    const { activeSessionId } = get();
    if (activeSessionId) set({ solves: await getSessionSolves(activeSessionId), allSolves: await getAllSolves() });
  },

  setComment: async (solveId, comment) => {
    await updateSolve(solveId, { comment });
    const { activeSessionId } = get();
    if (activeSessionId) set({ solves: await getSessionSolves(activeSessionId) });
  },

  saveReconstruction: async (solveId, reconstruction) => {
    await updateSolve(solveId, { reconstruction });
    const { activeSessionId } = get();
    if (activeSessionId) set({ solves: await getSessionSolves(activeSessionId) });
  },

  setPendingEvent: (event) => set({ pendingEvent: event }),

  removeSolve: async (solveId) => {
    await deleteSolve(solveId);
    void deleteRemoteSolve(solveId);
    const { activeSessionId } = get();
    if (activeSessionId) set({ solves: await getSessionSolves(activeSessionId), allSolves: await getAllSolves() });
  },

  clearPB: () => set({ lastPB: null }),
  clearAchievementToast: () => set({ achievementToast: null }),

  exportActiveSession: () => {
    const { activeSessionId, sessions, solves } = get();
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const data = buildSessionExport(session.name, solves);
    const datePart = new Date().toISOString().slice(0, 10);
    downloadJson(`${session.name.replace(/[^a-z0-9]+/gi, "-")}-${datePart}.json`, data);
  },

  importIntoActiveSession: async (json) => {
    const { activeSessionId, importRowsIntoActiveSession } = get();
    if (!activeSessionId) return 0;
    return importRowsIntoActiveSession(parseSessionExport(JSON.parse(json)));
  },

  importRowsIntoActiveSession: async (rows) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return 0;
    const count = await importSolves(activeSessionId, rows);
    set({ solves: await getSessionSolves(activeSessionId), allSolves: await getAllSolves() });
    return count;
  },

  refreshFromDb: async () => {
    const { activeSessionId } = get();
    const sessions = await listSessions();
    const allSolves = await getAllSolves();
    const solves = activeSessionId ? await getSessionSolves(activeSessionId) : [];
    set({ sessions, solves, allSolves });
  },

  adoptSyncedSessionIfLocalEmpty: async () => {
    const { activeSessionId, solves, sessions, allSolves } = get();
    if (!activeSessionId || solves.length > 0) return;
    const counts = new Map<string, number>();
    for (const s of allSolves) counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1);
    const candidate = sessions
      .filter((s) => s.id !== activeSessionId && (counts.get(s.id) ?? 0) > 0)
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0];
    if (candidate) await get().switchSession(candidate.id);
  },
}));
