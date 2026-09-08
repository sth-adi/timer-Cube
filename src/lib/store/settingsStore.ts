import { create } from "zustand";
import { persist } from "zustand/middleware";

export type InputMethod = "spacebar" | "tap";

export const THEMES = [
  { id: "nebula", name: "Nebula", swatch: "#7c5cff" },
  { id: "mint", name: "Mint", swatch: "#2dd4bf" },
  { id: "carbon", name: "Carbon", swatch: "#fafafa" },
  { id: "sunset", name: "Sunset", swatch: "#ff7a59" },
  { id: "terminal", name: "Terminal", swatch: "#3ddc84" },
  { id: "speedcube", name: "Speedcube", swatch: "#ffd500" },
  { id: "paper", name: "Paper", swatch: "#5b3df5" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export interface SettingsState {
  inspectionEnabled: boolean;
  inputMethod: InputMethod;
  holdToStartMs: number;
  theme: ThemeId;
  hintSolverEnabled: boolean;
  soundEnabled: boolean;
  /** Target solve count per day, for the practice-goal ring. */
  dailyGoal: number;
  /** Blanks the running digits so you can't pace yourself against them mid-solve. */
  hideTimeWhileSolving: boolean;
  setInspectionEnabled: (v: boolean) => void;
  setInputMethod: (v: InputMethod) => void;
  setHoldToStartMs: (v: number) => void;
  setTheme: (v: ThemeId) => void;
  setHintSolverEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setDailyGoal: (v: number) => void;
  setHideTimeWhileSolving: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      inspectionEnabled: true,
      inputMethod: "spacebar",
      holdToStartMs: 300,
      theme: "nebula",
      hintSolverEnabled: true,
      soundEnabled: false,
      dailyGoal: 20,
      hideTimeWhileSolving: false,
      setInspectionEnabled: (v) => set({ inspectionEnabled: v }),
      setInputMethod: (v) => set({ inputMethod: v }),
      setHoldToStartMs: (v) => set({ holdToStartMs: v }),
      setTheme: (v) => set({ theme: v }),
      setHintSolverEnabled: (v) => set({ hintSolverEnabled: v }),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setDailyGoal: (v) => set({ dailyGoal: v }),
      setHideTimeWhileSolving: (v) => set({ hideTimeWhileSolving: v }),
    }),
    {
      name: "cube-timer-settings",
      version: 2,
      // v1 stored theme as "dark" | "light"; map those onto named themes so
      // an existing install doesn't land on an undefined data-theme.
      migrate: (persisted, version) => {
        const state = persisted as Omit<Partial<SettingsState>, "theme"> & { theme?: string };
        if (version < 2) {
          state.theme = state.theme === "light" ? "paper" : "nebula";
        }
        return state as unknown as SettingsState;
      },
    },
  ),
);
