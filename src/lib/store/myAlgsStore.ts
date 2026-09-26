import { create } from "zustand";
import { persist } from "zustand/middleware";
import { findCase } from "@/lib/algorithms/caseLookup";
import { autoMainAlg, learnFromExecutions, myAlgKey, normalizedAlg, type NewAlg, type SeenAlg } from "@/lib/algorithms/myAlgs";
import type { AlgExecution } from "@/lib/xray/algMicroscope";

interface MyAlgsState {
  /** "OLL:Sune" → the algorithm you use for it (yellow top, green front). */
  chosen: Record<string, string>;
  /** Cases whose algorithm you picked yourself — never changed behind your back. */
  manualKeys: string[];
  /** Every clean, one-look algorithm you've been seen doing, per case. */
  seen: Record<string, SeenAlg[]>;
  /** Algorithms you've removed from a case (normalized), so they aren't learned again. */
  dismissed: Record<string, string[]>;
  /** Solves up to this date have been read. */
  learnedThrough: number;
  /** The most recent algorithms learned as yours. */
  recent: NewAlg[];
  choose: (key: string, alg: string) => void;
  clear: (key: string) => void;
  learn: (executions: readonly AlgExecution[], through: number) => void;
  dismiss: (key: string, alg: string) => void;
}

const bookAlg = (group: "OLL" | "PLL", name: string) => findCase(group, name)?.alg;

/** Re-derives the automatic main algorithm for cases you haven't picked one for. */
function autoChosen(chosen: Record<string, string>, keys: Iterable<string>, s: Pick<MyAlgsState, "manualKeys" | "seen" | "dismissed">): Record<string, string> {
  const next = { ...chosen };
  for (const key of keys) {
    if (s.manualKeys.includes(key)) continue;
    const main = autoMainAlg(s.seen[key], s.dismissed[key]);
    if (main) next[key] = main;
    else delete next[key];
  }
  return next;
}

export const useMyAlgsStore = create<MyAlgsState>()(
  persist(
    (set) => ({
      chosen: {},
      manualKeys: [],
      seen: {},
      dismissed: {},
      learnedThrough: 0,
      recent: [],
      choose: (key, alg) => set((s) => ({ chosen: { ...s.chosen, [key]: alg }, manualKeys: [...new Set([...s.manualKeys, key])] })),
      clear: (key) =>
        set((s) => {
          const next = { ...s.chosen };
          delete next[key];
          return { chosen: next, manualKeys: [...new Set([...s.manualKeys, key])] };
        }),
      learn: (executions, through) =>
        set((s) => {
          const { seen, fresh } = learnFromExecutions(s.seen, executions, bookAlg);
          const touched = new Set(executions.map((e) => myAlgKey(e.step, e.caseName)));
          const kept = fresh.filter((f) => !(s.dismissed[f.key] ?? []).includes(normalizedAlg(f.alg) ?? ""));
          return {
            seen,
            chosen: autoChosen(s.chosen, touched, { ...s, seen }),
            learnedThrough: Math.max(s.learnedThrough, through),
            recent: [...s.recent, ...kept].slice(-20),
          };
        }),
      dismiss: (key, alg) =>
        set((s) => {
          const norm = normalizedAlg(alg);
          if (!norm) return s;
          const dismissed = { ...s.dismissed, [key]: [...new Set([...(s.dismissed[key] ?? []), norm])] };
          const seen = { ...s.seen, [key]: (s.seen[key] ?? []).filter((x) => normalizedAlg(x.alg) !== norm) };
          // Removing the algorithm you'd picked yourself hands the case back to the automatic choice.
          const wasChosen = s.chosen[key] !== undefined && normalizedAlg(s.chosen[key]) === norm;
          const manualKeys = wasChosen ? s.manualKeys.filter((k) => k !== key) : s.manualKeys;
          const base = { ...s.chosen };
          if (wasChosen) delete base[key];
          return { dismissed, seen, manualKeys, chosen: autoChosen(base, [key], { manualKeys, seen, dismissed }), recent: s.recent.filter((r) => !(r.key === key && normalizedAlg(r.alg) === norm)) };
        }),
    }),
    {
      name: "cube-timer-my-algs",
      version: 1,
      // Before learning existed, every chosen algorithm was picked by hand.
      migrate: (persisted, version) => {
        const state = persisted as Partial<MyAlgsState>;
        if (version < 1) state.manualKeys = Object.keys(state.chosen ?? {});
        return state as MyAlgsState;
      },
    },
  ),
);
