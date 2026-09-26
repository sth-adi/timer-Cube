import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Journey } from "@/lib/journey/journey";

export interface PastJourney extends Journey {
  endedAt: number;
  finalMs: number | null;
  reached: boolean;
}

interface JourneyState {
  journey: Journey | null;
  past: PastJourney[];
  start: (j: Journey) => void;
  end: (result: { endedAt: number; finalMs: number | null; reached: boolean }) => void;
}

/** The Training Journey in progress, and the ones before it. */
export const useJourneyStore = create<JourneyState>()(
  persist(
    (set) => ({
      journey: null,
      past: [],
      start: (journey) => set({ journey }),
      end: (result) => set((s) => (s.journey ? { journey: null, past: [...s.past, { ...s.journey, ...result }].slice(-20) } : s)),
    }),
    { name: "cube-timer-journey" },
  ),
);
