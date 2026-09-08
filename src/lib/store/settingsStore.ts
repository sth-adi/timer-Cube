import { create } from "zustand";
import { persist } from "zustand/middleware";

export type InputMethod = "spacebar" | "tap";

export interface SettingsState {
  inspectionEnabled: boolean;
  inputMethod: InputMethod;
  holdToStartMs: number;
  theme: "dark" | "light";
  hintSolverEnabled: boolean;
  soundEnabled: boolean;
  /** Target solve count per day, for the practice-goal ring. */
  dailyGoal: number;
  setInspectionEnabled: (v: boolean) => void;
  setInputMethod: (v: InputMethod) => void;
  setHoldToStartMs: (v: number) => void;
  setTheme: (v: "dark" | "light") => void;
  setHintSolverEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setDailyGoal: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      inspectionEnabled: true,
      inputMethod: "spacebar",
      holdToStartMs: 300,
      theme: "dark",
      hintSolverEnabled: true,
      soundEnabled: false,
      dailyGoal: 20,
      setInspectionEnabled: (v) => set({ inspectionEnabled: v }),
      setInputMethod: (v) => set({ inputMethod: v }),
      setHoldToStartMs: (v) => set({ holdToStartMs: v }),
      setTheme: (v) => set({ theme: v }),
      setHintSolverEnabled: (v) => set({ hintSolverEnabled: v }),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setDailyGoal: (v) => set({ dailyGoal: v }),
    }),
    { name: "cube-timer-settings" },
  ),
);
