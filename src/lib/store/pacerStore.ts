import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PacerState {
  enabled: boolean;
  targetMs: number;
  setEnabled: (enabled: boolean) => void;
  setTargetMs: (ms: number) => void;
}

/** Split Pacer settings: whether it calls pace during smart-cube solves, and the time it paces you to. */
export const usePacerStore = create<PacerState>()(
  persist(
    (set) => ({
      enabled: false,
      targetMs: 20000,
      setEnabled: (enabled) => set({ enabled }),
      setTargetMs: (targetMs) => set({ targetMs }),
    }),
    { name: "cube-timer-split-pacer" },
  ),
);
