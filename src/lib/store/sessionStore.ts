import { create } from "zustand";
import type { Session, Solve } from "@/types";
import { ensureDefaultSession } from "@/lib/db/db";
import { createSession, listSessions, renameSession, deleteSession, moveSessionSolves } from "@/lib/db/sessions";
import { forgetAutoSessionId, pickInitialSession, readAutoSessionId, readSavedSessionId, saveSessionId } from "@/lib/sessions/activeSession";
import { addSolve, deleteSolve, restoreSolves, updateSolve, updateSolvesBulk, getSessionSolves, getAllSolves, importSolvesWithReport, type ImportResult } from "@/lib/db/solves";
import { lateStartRepairPending, markLateStartRepairDone, repairLateStart } from "@/lib/db/repairLateStart";
import { requestPersistentStorage } from "@/lib/storage/persist";
import type { EventTag, Penalty, WcaEvent } from "@/types";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { scopedSolves } from "@/lib/stats/scope";
import { computeAchievements, computeSessionStats, normalSolves, type AchievementState, type SessionStats } from "@/lib/stats/stats";
import { buildSessionExport, downloadJson, parseSessionExport, type SessionExport } from "@/lib/utils/sessionExport";

const NOTHING_IMPORTED: ImportResult = { added: 0, updated: 0, skipped: 0 };

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

/**
 * The record a new solve set, comparing stats before and after it. Each kind
 * only counts when the scope already had one to beat: the first ao5 (or
 * ao12, or single) that exists is just the first, not a personal best.
 */
export function detectPB(prev: SessionStats, next: SessionStats): { kind: PBKind; ms: number } | null {
  if (next.bestAo12 !== null && prev.bestAo12 !== null && next.bestAo12 < prev.bestAo12) return { kind: "ao12", ms: next.bestAo12 };
  if (next.bestAo5 !== null && prev.bestAo5 !== null && next.bestAo5 < prev.bestAo5) return { kind: "ao5", ms: next.bestAo5 };
  if (next.best !== null && prev.best !== null && next.best < prev.best) return { kind: "single", ms: next.best };
  return null;
}

/** How many deletions Undo can walk back through, newest first. */
export const UNDO_DEPTH = 10;

export interface RemovedBatch {
  solves: Solve[];
  id: number;
}

/** The row with `patch` applied wherever its id is listed; untouched rows keep their identity. */
function patchRows(rows: Solve[], ids: Set<string>, patch: Partial<Solve>): Solve[] {
  return rows.map((s) => (ids.has(s.id) ? { ...s, ...patch } : s));
}

/** Patches rows in both lists — `solves` (open session) and `allSolves` — so stats reading either never go stale. */
function patchBoth(state: { solves: Solve[]; allSolves: Solve[] }, ids: string[], patch: Partial<Solve>) {
  const set = new Set(ids);
  return { solves: patchRows(state.solves, set, patch), allSolves: patchRows(state.allSolves, set, patch) };
}

function saveFailure(e: unknown): { message: string; at: number } {
  console.error("Saving to local storage failed", e);
  return { message: e instanceof Error ? e.message : String(e), at: Date.now() };
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
  /** The last write to IndexedDB that failed (storage full or blocked), until dismissed — see SaveErrorBanner. */
  saveError: { message: string; at: number } | null;
  clearSaveError: () => void;
  init: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  addSession: (name: string, event?: WcaEvent) => Promise<void>;
  renameActiveSession: (name: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  /** Renames any session, not just the open one. */
  renameSessionById: (id: string, name: string) => Promise<void>;
  /** Moves every solve from one session into another, then removes the emptied one. */
  mergeSessions: (fromId: string, intoId: string) => Promise<void>;
  recordSolve: (
    timeMs: number,
    scramble: string,
    splits?: number[],
    event?: EventTag,
    reconstruction?: string,
    heartRate?: { avg: number; max: number },
    crossMs?: number,
    moveTimestamps?: number[],
    gyro?: {
      rotations: { atMs: number; token: string }[];
      orientedReconstruction: string;
      stream?: { atMs: number[]; qx: number[]; qy: number[]; qz: number[]; qw: number[] } | null;
    },
    /** A penalty earned before the solve started (inspection overrun: +2 or DNF). */
    penalty?: Penalty,
    /** The smart cube this solve was made on. */
    cube?: Solve["cube"],
    /** A turn put back (or removed) from the cube's own state report. */
    repaired?: Solve["repaired"],
  ) => Promise<string | undefined>;
  setPenalty: (solveId: string, penalty: Penalty) => Promise<void>;
  setComment: (solveId: string, comment: string) => Promise<void>;
  saveReconstruction: (solveId: string, reconstruction: string) => Promise<void>;
  /** Practice category the next timed solve will be tagged with; sticky until changed, not persisted. */
  pendingEvent: EventTag | null;
  setPendingEvent: (event: EventTag | null) => void;
  removeSolve: (solveId: string) => Promise<void>;
  /** Applies the same penalty and/or practice tag to several solves at once. `event: null` makes them ordinary solves again. */
  updateSolves: (solveIds: string[], changes: { penalty?: Penalty; event?: EventTag | null }) => Promise<void>;
  /** Deletes several solves at once (one undo brings them all back). */
  removeSolves: (solveIds: string[]) => Promise<void>;
  /** The last UNDO_DEPTH deletions, oldest first, each a batch one Undo puts back — see UndoToast. */
  undoStack: RemovedBatch[];
  /** Puts back the most recent deletion still on the stack. */
  undoRemove: () => Promise<void>;
  /** Forgets every deletion on the stack. */
  dismissUndo: () => void;
  clearPB: () => void;
  clearAchievementToast: () => void;
  exportActiveSession: () => void;
  importIntoActiveSession: (json: string) => Promise<ImportResult>;
  importRowsIntoActiveSession: (rows: SessionExport["solves"]) => Promise<ImportResult>;
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
  /**
   * After a successful cloud sync: removes the empty "Session 1" this device
   * auto-created for itself if the account turned out to have other sessions,
   * so every new browser stops adding one to the pile. Only ever touches the
   * session whose id ensureDefaultSession remembered — never one the user made
   * — and never one with solves. Removing it syncs as an ordinary tombstone.
   */
  dropEmptyAutoSession: () => Promise<void>;
}

let pbEventId = 0;
let removedId = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  solves: [],
  allSolves: [],
  loaded: false,
  lastPB: null,
  achievementToast: null,
  saveError: null,
  pendingEvent: null,

  init: async () => {
    await ensureDefaultSession();
    const sessions = await listSessions();
    let allSolves = await getAllSolves();
    // Solves saved while the smart-cube timer wrongly started at the cross: put their times right.
    // A one-off per device (the bug is fixed, so nothing new needs it), patched in memory so the
    // list isn't loaded a second time.
    if (lateStartRepairPending()) {
      try {
        const fixed = new Map<string, Solve>();
        for (const x of allSolves) {
          const fix = repairLateStart(x);
          if (fix) fixed.set(x.id, { ...x, ...fix, updatedAt: await updateSolve(x.id, fix) });
        }
        if (fixed.size > 0) allSolves = allSolves.map((x) => fixed.get(x.id) ?? x);
        markLateStartRepairDone();
      } catch (e) {
        // Left unflagged: tried again next start.
        console.warn("Late-start repair failed", e);
      }
    }
    // Reopen what this device last had open — every page and every reload, not just the first.
    const first = pickInitialSession(sessions, allSolves, readSavedSessionId()) ?? (await ensureDefaultSession());
    saveSessionId(first.id);
    // allSolves is date-ordered, so this is the same list getSessionSolves would return.
    const solves = allSolves.filter((x) => x.sessionId === first.id);
    set({ sessions, activeSessionId: first.id, solves, allSolves, loaded: true });
    void useScrambleStore.getState().setEvent(first.event);
    if (allSolves.length > 0) void requestPersistentStorage();
  },

  switchSession: async (id) => {
    const solves = await getSessionSolves(id);
    saveSessionId(id);
    set({ activeSessionId: id, solves });
    const session = get().sessions.find((s) => s.id === id);
    if (session) void useScrambleStore.getState().setEvent(session.event);
  },

  addSession: async (name, event) => {
    const session = await createSession(name, event);
    const sessions = await listSessions();
    saveSessionId(session.id);
    set({ sessions, activeSessionId: session.id, solves: [] });
    void useScrambleStore.getState().setEvent(session.event);
  },

  renameActiveSession: async (name) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    await renameSession(activeSessionId, name);
    set({ sessions: await listSessions() });
  },

  renameSessionById: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await renameSession(id, trimmed.slice(0, 40));
    set({ sessions: await listSessions() });
  },

  mergeSessions: async (fromId, intoId) => {
    if (fromId === intoId) return;
    await moveSessionSolves(fromId, intoId);
    const { activeSessionId } = get();
    // Land on the merged session if the one being folded away was open.
    if (activeSessionId === fromId) await get().switchSession(intoId);
    await get().removeSession(fromId);
    const solves = await getSessionSolves(get().activeSessionId ?? intoId);
    set({ solves, allSolves: await getAllSolves() });
  },

  removeSession: async (id) => {
    // Recorded as a deletion locally; the next sync (triggered by this very
    // change) carries it to the cloud and every other device.
    await deleteSession(id);
    const sessions = await listSessions();
    const active = get().activeSessionId;
    const allSolves = await getAllSolves();
    if (active === id) {
      const fallback = pickInitialSession(sessions, allSolves, null) ?? (await ensureDefaultSession());
      const solves = await getSessionSolves(fallback.id);
      saveSessionId(fallback.id);
      set({ sessions: await listSessions(), activeSessionId: fallback.id, solves, allSolves });
    } else {
      set({ sessions, allSolves });
    }
  },

  recordSolve: async (timeMs, scramble, splits, event, reconstruction, heartRate, crossMs, moveTimestamps, gyro, penalty, cube, repaired) => {
    const { activeSessionId, solves: prevSolves, allSolves: prevAllSolves } = get();
    if (!activeSessionId) return undefined;
    // PB detection and achievements only ever look at ordinary 2-handed
    // solves — see normalSolves() — so tagging a solve OH/feet/BLD never
    // triggers a PB toast or unlocks a milestone that assumes normal timing,
    // and never corrupts the running normal average either. PBs are judged
    // over the same solves the stats panels show ("This session" / "All
    // sessions" of this event — see scopedSolves), so "New best ao5!" always
    // agrees with the Best ao5 there.
    const scope = useSettingsStore.getState().statsScope;
    const pbSolves = (session: Solve[], all: Solve[]) => normalSolves(scopedSolves(scope, activeSessionId, get().sessions, session, all));
    const prevStats = computeSessionStats(pbSolves(prevSolves, prevAllSolves));
    const prevAchievements = computeAchievements(normalSolves(prevAllSolves));

    let saved: Solve;
    try {
      saved = await addSolve({
        sessionId: activeSessionId,
        timeMs,
        scramble,
        penalty,
        splits,
        event: event ?? undefined,
        reconstruction,
        heartRate,
        crossMs,
        moveTimestamps,
        rotations: gyro?.rotations,
        orientedReconstruction: gyro?.orientedReconstruction,
        gyroStream: gyro?.stream ?? undefined,
        cube,
        repaired,
      });
    } catch (e) {
      set({ saveError: saveFailure(e) });
      return undefined;
    }
    // The row addSolve saved is appended in memory — no re-read of the whole history.
    const solves = [...prevSolves, saved];
    const allSolves = [...prevAllSolves, saved];
    const newStats = computeSessionStats(pbSolves(solves, allSolves));
    const newAchievements = computeAchievements(normalSolves(allSolves));

    const record = detectPB(prevStats, newStats);
    const pb: PBEvent | null = record ? { ...record, id: ++pbEventId } : null;

    const newlyUnlocked = findNewlyUnlocked(prevAchievements, newAchievements);
    const achievementToast: AchievementToastEvent | null = newlyUnlocked[0]
      ? { id: newlyUnlocked[0].id, label: newlyUnlocked[0].label, icon: newlyUnlocked[0].icon, toastId: ++achievementToastId }
      : null;

    // Appended to whatever is current now, not the snapshot above: edits made while the write was in flight stay.
    set((state) => ({
      solves: state.activeSessionId === activeSessionId && !state.solves.some((x) => x.id === saved.id) ? [...state.solves, saved] : state.solves,
      allSolves: state.allSolves.some((x) => x.id === saved.id) ? state.allSolves : [...state.allSolves, saved],
      lastPB: pb,
      achievementToast,
    }));
    void requestPersistentStorage();
    return saved.id;
  },

  clearSaveError: () => set({ saveError: null }),

  setPenalty: async (solveId, penalty) => {
    await get().updateSolves([solveId], { penalty });
  },

  setComment: async (solveId, comment) => {
    try {
      const updatedAt = await updateSolve(solveId, { comment });
      set((state) => patchBoth(state, [solveId], { comment, updatedAt }));
    } catch (e) {
      set({ saveError: saveFailure(e) });
    }
  },

  saveReconstruction: async (solveId, reconstruction) => {
    try {
      const updatedAt = await updateSolve(solveId, { reconstruction });
      set((state) => patchBoth(state, [solveId], { reconstruction, updatedAt }));
    } catch (e) {
      set({ saveError: saveFailure(e) });
    }
  },

  setPendingEvent: (event) => set({ pendingEvent: event }),

  undoStack: [],

  removeSolve: async (solveId) => get().removeSolves([solveId]),

  updateSolves: async (solveIds, changes) => {
    const patch: Partial<Solve> = {};
    if (changes.penalty !== undefined) patch.penalty = changes.penalty;
    if (changes.event !== undefined) patch.event = changes.event ?? undefined;
    try {
      const updatedAt = await updateSolvesBulk(solveIds, patch);
      set((state) => patchBoth(state, solveIds, { ...patch, updatedAt }));
    } catch (e) {
      set({ saveError: saveFailure(e) });
    }
  },

  removeSolves: async (solveIds) => {
    const { allSolves, solves } = get();
    const known = new Map([...allSolves, ...solves].map((s) => [s.id, s]));
    const gone = solveIds.map((id) => known.get(id)).filter((s): s is Solve => !!s);
    try {
      for (const id of solveIds) await deleteSolve(id);
    } catch (e) {
      set({ saveError: saveFailure(e) });
      // Some may have gone before the failure: show what the database really holds.
      await get().refreshFromDb().catch(() => {});
      return;
    }
    const ids = new Set(solveIds);
    set((state) => ({
      undoStack: gone.length ? [...state.undoStack, { solves: gone, id: ++removedId }].slice(-UNDO_DEPTH) : state.undoStack,
      solves: state.solves.filter((x) => !ids.has(x.id)),
      allSolves: state.allSolves.filter((x) => !ids.has(x.id)),
    }));
  },

  undoRemove: async () => {
    const pending = get().undoStack.at(-1);
    if (!pending) return;
    // Popped before the write, so a second press while this one is in flight takes the batch below.
    set((state) => ({ undoStack: state.undoStack.filter((b) => b.id !== pending.id) }));
    let rows: Solve[];
    try {
      rows = await restoreSolves(pending.solves);
    } catch (e) {
      // Back where it was in the stack (ids only grow), under anything deleted meanwhile.
      set((state) => ({
        saveError: saveFailure(e),
        undoStack: [...state.undoStack, pending].sort((a, b) => a.id - b.id).slice(-UNDO_DEPTH),
      }));
      return;
    }
    // Back in date order, where a re-read would have put them.
    const back = new Set(rows.map((r) => r.id));
    const mergeInto = (list: Solve[], add: Solve[]) => [...list.filter((x) => !back.has(x.id)), ...add].sort((a, b) => a.date - b.date);
    set((state) => ({
      solves: mergeInto(state.solves, rows.filter((r) => r.sessionId === state.activeSessionId)),
      allSolves: mergeInto(state.allSolves, rows),
    }));
  },

  dismissUndo: () => set({ undoStack: [] }),

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
    if (!activeSessionId) return NOTHING_IMPORTED;
    return importRowsIntoActiveSession(parseSessionExport(JSON.parse(json)));
  },

  importRowsIntoActiveSession: async (rows) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return NOTHING_IMPORTED;
    const result = await importSolvesWithReport(activeSessionId, rows);
    set({ solves: await getSessionSolves(activeSessionId), allSolves: await getAllSolves() });
    return result;
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

  dropEmptyAutoSession: async () => {
    const autoId = readAutoSessionId();
    if (!autoId) return;
    const sessions = await listSessions();
    // Gone already, or used since: it's an ordinary session now.
    if (!sessions.some((s) => s.id === autoId) || (await getSessionSolves(autoId)).length > 0) {
      forgetAutoSessionId();
      return;
    }
    // Still the only session: keep it, and look again after a later sync.
    if (sessions.length < 2) return;
    // removeSession opens the session with the most solves if this one was open.
    await get().removeSession(autoId);
    forgetAutoSessionId();
  },
}));
