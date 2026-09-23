import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GyroCalibration } from "@/lib/gyro/orientation";

export type InputMethod = "spacebar" | "tap";

/**
 * How many phases a solve is timed in. 1 is an ordinary single-stop timer;
 * above that, each press marks the end of a phase and only the last one stops
 * the clock — the same "multiphase" convention other timers use.
 */
export const PHASE_COUNTS = [1, 2, 3, 4] as const;
export type PhaseCount = (typeof PHASE_COUNTS)[number];

/** Names for each phase, by how many the solve is split into. */
export const PHASE_LABELS: Record<PhaseCount, readonly string[]> = {
  1: ["Solve"],
  2: ["F2L", "Last layer"],
  3: ["F2L", "OLL", "PLL"],
  4: ["Cross", "F2L", "OLL", "PLL"],
};

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

/**
 * Background and timer-digit styling are independent of `theme` (which only
 * sets the color palette) and of each other, so the 7 themes × 5 backgrounds
 * × 4 timer styles combine into 140 distinct looks — a big, genuinely varied
 * set built from three small, independently reviewable pieces rather than
 * 100+ bespoke one-off designs, the same principle behind statTiles.ts's
 * "big registry, not bespoke" stat tiles.
 */
export const BACKGROUND_STYLES = [
  { id: "aurora", name: "Aurora" },
  { id: "grid", name: "Grid" },
  { id: "particles", name: "Particles" },
  { id: "waves", name: "Waves" },
  { id: "minimal", name: "Minimal" },
] as const;
export type BackgroundStyleId = (typeof BACKGROUND_STYLES)[number]["id"];

export const TIMER_STYLES = [
  { id: "glow", name: "Glow" },
  { id: "flat", name: "Flat" },
  { id: "gradient", name: "Gradient" },
  { id: "outline", name: "Outline" },
] as const;
export type TimerStyleId = (typeof TIMER_STYLES)[number]["id"];

export interface SettingsState {
  inspectionEnabled: boolean;
  inputMethod: InputMethod;
  holdToStartMs: number;
  theme: ThemeId;
  backgroundStyle: BackgroundStyleId;
  timerStyle: TimerStyleId;
  hintSolverEnabled: boolean;
  soundEnabled: boolean;
  /** Target solve count per day, for the practice-goal ring. */
  dailyGoal: number;
  /** Blanks the running digits so you can't pace yourself against them mid-solve. */
  hideTimeWhileSolving: boolean;
  /** Number of phases each solve is timed in; 1 means a plain single-stop timer. */
  phaseCount: PhaseCount;
  /**
   * How each smart-cube protocol's IMU is mounted, learned by the gyro
   * calibration wizard — keyed by protocol name ("GAN Gen3", "MoYu32"…)
   * since the mounting is a property of the hardware family, not of one
   * particular cube. Absent means "use the GAN default".
   */
  gyroCalibrations: Record<string, GyroCalibration>;
  /** Whether identity-sequence gestures on a connected smart cube (e.g. U U U U) trigger app actions. */
  cubeGestures: boolean;
  setInspectionEnabled: (v: boolean) => void;
  setInputMethod: (v: InputMethod) => void;
  setHoldToStartMs: (v: number) => void;
  setTheme: (v: ThemeId) => void;
  setBackgroundStyle: (v: BackgroundStyleId) => void;
  setTimerStyle: (v: TimerStyleId) => void;
  setHintSolverEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setDailyGoal: (v: number) => void;
  setHideTimeWhileSolving: (v: boolean) => void;
  setPhaseCount: (v: PhaseCount) => void;
  setGyroCalibration: (protocol: string, calibration: GyroCalibration | null) => void;
  setCubeGestures: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      inspectionEnabled: true,
      inputMethod: "spacebar",
      holdToStartMs: 300,
      theme: "nebula",
      backgroundStyle: "aurora",
      timerStyle: "glow",
      hintSolverEnabled: true,
      soundEnabled: false,
      dailyGoal: 20,
      hideTimeWhileSolving: false,
      phaseCount: 1,
      gyroCalibrations: {},
      cubeGestures: true,
      setInspectionEnabled: (v) => set({ inspectionEnabled: v }),
      setInputMethod: (v) => set({ inputMethod: v }),
      setHoldToStartMs: (v) => set({ holdToStartMs: v }),
      setTheme: (v) => set({ theme: v }),
      setBackgroundStyle: (v) => set({ backgroundStyle: v }),
      setTimerStyle: (v) => set({ timerStyle: v }),
      setHintSolverEnabled: (v) => set({ hintSolverEnabled: v }),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setDailyGoal: (v) => set({ dailyGoal: v }),
      setHideTimeWhileSolving: (v) => set({ hideTimeWhileSolving: v }),
      setPhaseCount: (v) => set({ phaseCount: v }),
      setGyroCalibration: (protocol, calibration) =>
        set((s) => {
          const next = { ...s.gyroCalibrations };
          if (calibration) next[protocol] = calibration;
          else delete next[protocol];
          return { gyroCalibrations: next };
        }),
      setCubeGestures: (v) => set({ cubeGestures: v }),
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
