import { create } from "zustand";
import { persist } from "zustand/middleware";

export type InputMethod = "spacebar" | "tap";

export interface SettingsState {
  inspectionEnabled: boolean;
  inputMethod: InputMethod;
  holdToStartMs: number;
  theme: "dark" | "light";
  hintSolverEnabled: boolean;
  setInspectionEnabled: (v: boolean) => void;
  setInputMethod: (v: InputMethod) => void;
  setHoldToStartMs: (v: number) => void;
  setTheme: (v: "dark" | "light") => void;
  setHintSolverEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      inspectionEnabled: true,
      inputMethod: "spacebar",
      holdToStartMs: 300,
      theme: "dark",
      hintSolverEnabled: true,
      setInspectionEnabled: (v) => set({ inspectionEnabled: v }),
      setInputMethod: (v) => set({ inputMethod: v }),
      setHoldToStartMs: (v) => set({ holdToStartMs: v }),
      setTheme: (v) => set({ theme: v }),
      setHintSolverEnabled: (v) => set({ hintSolverEnabled: v }),
    }),
    { name: "cube-timer-settings" },
  ),
);
