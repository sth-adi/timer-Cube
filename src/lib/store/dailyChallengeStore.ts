import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { todayDateKey, nextStreak } from "@/lib/analysis/dailyChallenge";

export const DAILY_CHALLENGE_LENGTH = 5;

interface DailyChallengeState {
  dateKey: string;
  /** Always DAILY_CHALLENGE_LENGTH entries once loaded — the same 5 WCA-legal scrambles for the whole day. */
  scrambles: string[];
  /** Parallel to `scrambles`; null until that solve is timed. */
  times: (number | null)[];
  streak: number;
  lastCompletedDateKey: string | null;
  loading: boolean;
  /** The last ensureToday() failed (e.g. the scramble worker rejected); cleared when it is retried. */
  error: boolean;
  /** Generates today's 5 scrambles if they haven't been already — a no-op once today is loaded. */
  ensureToday: () => Promise<void>;
  /** Records the next untimed solve's result, in order. Bumps the streak once all 5 are in. */
  recordTime: (ms: number) => void;
}

// Guards against two overlapping ensureToday() calls (e.g. StrictMode's
// double-invoked effects) both winning the "generate 5 scrambles" race and
// clobbering each other's results.
let ensurePromise: Promise<void> | null = null;

export const useDailyChallengeStore = create<DailyChallengeState>()(
  persist(
    (set, get) => ({
      dateKey: "",
      scrambles: [],
      times: [],
      streak: 0,
      lastCompletedDateKey: null,
      loading: false,
      error: false,

      ensureToday: () => {
        const today = todayDateKey();
        if (get().dateKey === today && get().scrambles.length === DAILY_CHALLENGE_LENGTH) {
          return Promise.resolve();
        }
        if (!ensurePromise) {
          ensurePromise = (async () => {
            set({ loading: true, error: false });
            try {
              const client = getCubeEngineClient();
              await client.ready();
              const scrambles: string[] = [];
              for (let i = 0; i < DAILY_CHALLENGE_LENGTH; i++) {
                scrambles.push(await client.generateScramble());
              }
              set({
                dateKey: today,
                scrambles,
                times: Array<null>(DAILY_CHALLENGE_LENGTH).fill(null),
              });
            } catch {
              set({ error: true });
            } finally {
              set({ loading: false });
            }
            // Cleared from a .then so it can't run before the assignment below
            // (a synchronous throw above would otherwise leave a stale promise behind).
          })().then(() => {
            ensurePromise = null;
          });
        }
        return ensurePromise;
      },

      recordTime: (ms) => {
        const { times, streak, lastCompletedDateKey } = get();
        const nextIndex = times.findIndex((t) => t === null);
        if (nextIndex === -1) return; // today's challenge is already fully timed
        const updated = [...times];
        updated[nextIndex] = ms;

        if (nextIndex === DAILY_CHALLENGE_LENGTH - 1) {
          set({
            times: updated,
            streak: nextStreak(lastCompletedDateKey, streak),
            lastCompletedDateKey: todayDateKey(),
          });
        } else {
          set({ times: updated });
        }
      },
    }),
    {
      name: "cube-timer-daily-challenge",
      // `loading` and `error` are transient — always recomputed by the next ensureToday() call.
      partialize: (s) => ({
        dateKey: s.dateKey,
        scrambles: s.scrambles,
        times: s.times,
        streak: s.streak,
        lastCompletedDateKey: s.lastCompletedDateKey,
      }),
    },
  ),
);
