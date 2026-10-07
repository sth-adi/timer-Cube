import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GyroCalibration } from "@/lib/gyro/orientation";
import type { VoiceMode } from "@/lib/smartcube/voiceCoach";
import type { StatsScope } from "@/lib/stats/scope";
import { firstRunFxLevel, readDeviceSignals } from "@/lib/utils/deviceTier";

const SETTINGS_KEY = "cube-timer-settings";
/** Set once the first-run FX decision has been made, so it is never made twice. */
const FX_DECIDED_KEY = "cube-timer-fx-decided";

/**
 * The persisted settings exactly as they were when this module loaded — before
 * persist, or any effect, can write the defaults back and make "never chose a
 * level" look like "chose insane". Null on the server and when storage is blocked.
 */
const settingsAtLoad: string | null = (() => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(SETTINGS_KEY);
  } catch {
    return null;
  }
})();

export type InputMethod = "spacebar" | "tap";

/** What times a solve on the Timer tab: the keyboard/touch timer, or a connected smart cube. */
export type TimerMode = "keyboard" | "smartcube";

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
  { id: "nebula", name: "Nebula", swatch: "#957eff" },
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
 * sets the color palette) and of each other, so the 7 themes × 7 backgrounds
 * × 4 timer styles combine into 196 distinct looks — a big, genuinely varied
 * set built from three small, independently reviewable pieces rather than
 * 100+ bespoke one-off designs, the same principle behind statTiles.ts's
 * "big registry, not bespoke" stat tiles.
 */
export const BACKGROUND_STYLES = [
  { id: "aurora", name: "Aurora" },
  { id: "grid", name: "Grid" },
  { id: "particles", name: "Particles" },
  { id: "waves", name: "Waves" },
  { id: "cubes", name: "Cubes" },
  { id: "warp", name: "Warp" },
  { id: "minimal", name: "Minimal" },
] as const;
export type BackgroundStyleId = (typeof BACKGROUND_STYLES)[number]["id"];

/**
 * How much visual spectacle the app puts on. "off" is the original flat look;
 * "spicy" is all the static upgrades (glowing card borders, floating dock,
 * holographic digits, film grain) with no pointer-tracking or particles;
 * "insane" adds everything that moves with you — cursor spotlight, card
 * tilt, click sparks, solve shockwaves, screen shake. prefers-reduced-motion
 * flattens the moving parts regardless of this setting.
 */
export const FX_LEVELS = [
  { id: "off", name: "Off" },
  { id: "spicy", name: "Spicy" },
  { id: "insane", name: "Insane" },
] as const;
export type FxLevelId = (typeof FX_LEVELS)[number]["id"];

export const TIMER_STYLES = [
  { id: "glow", name: "Glow" },
  { id: "flat", name: "Flat" },
  { id: "gradient", name: "Gradient" },
  { id: "outline", name: "Outline" },
] as const;
export type TimerStyleId = (typeof TIMER_STYLES)[number]["id"];

export interface SettingsState {
  /** What the Voice Coach says out loud during a smart-cube solve — see lib/smartcube/voiceCoach.ts. */
  voiceCoach: VoiceMode;
  /** Smart cube: scramble it by hand and let the cube's own state be the scramble, instead of following a generated one. */
  freestyle: boolean;
  /** Read the smart-cube scramble aloud as you make it. */
  voiceScramble: boolean;
  /** Keep the screen on while a smart cube is connected — a sleeping phone drops the Bluetooth link. */
  keepAwake: boolean;
  /** Names you've given your smart cubes, by cube id (see lib/smartcube/cubeIdentity.ts). */
  cubeNicknames: Record<string, string>;
  inspectionEnabled: boolean;
  inputMethod: InputMethod;
  holdToStartMs: number;
  theme: ThemeId;
  backgroundStyle: BackgroundStyleId;
  timerStyle: TimerStyleId;
  fxLevel: FxLevelId;
  hintSolverEnabled: boolean;
  /** The Live Session Coach strip between solves. */
  liveCoachEnabled: boolean;
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
  /** Whether the stats and insights panels read the open session or every session of its event. */
  statsScope: StatsScope;
  /**
   * The Timer tab's last-picked mode, so a smart-cube user isn't put back on
   * the keyboard timer every launch. Read through useTimerMode (app/page.tsx),
   * which renders "keyboard" until after hydration.
   */
  timerMode: TimerMode;
  setInspectionEnabled: (v: boolean) => void;
  setInputMethod: (v: InputMethod) => void;
  setHoldToStartMs: (v: number) => void;
  setTheme: (v: ThemeId) => void;
  setBackgroundStyle: (v: BackgroundStyleId) => void;
  setTimerStyle: (v: TimerStyleId) => void;
  setFxLevel: (v: FxLevelId) => void;
  setHintSolverEnabled: (v: boolean) => void;
  setLiveCoachEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setDailyGoal: (v: number) => void;
  setHideTimeWhileSolving: (v: boolean) => void;
  setPhaseCount: (v: PhaseCount) => void;
  setGyroCalibration: (protocol: string, calibration: GyroCalibration | null) => void;
  setCubeGestures: (v: boolean) => void;
  setVoiceCoach: (v: VoiceMode) => void;
  setFreestyle: (v: boolean) => void;
  setVoiceScramble: (v: boolean) => void;
  setKeepAwake: (v: boolean) => void;
  setCubeNickname: (id: string, nickname: string) => void;
  setStatsScope: (v: StatsScope) => void;
  setTimerMode: (v: TimerMode) => void;
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
      fxLevel: "insane",
      hintSolverEnabled: true,
      liveCoachEnabled: true,
      soundEnabled: false,
      dailyGoal: 20,
      hideTimeWhileSolving: false,
      phaseCount: 1,
      gyroCalibrations: {},
      cubeGestures: true,
      voiceCoach: "off",
      freestyle: false,
      voiceScramble: false,
      keepAwake: true,
      cubeNicknames: {},
      statsScope: "session",
      timerMode: "keyboard",
      setInspectionEnabled: (v) => set({ inspectionEnabled: v }),
      setInputMethod: (v) => set({ inputMethod: v }),
      setHoldToStartMs: (v) => set({ holdToStartMs: v }),
      setTheme: (v) => set({ theme: v }),
      setBackgroundStyle: (v) => set({ backgroundStyle: v }),
      setTimerStyle: (v) => set({ timerStyle: v }),
      setFxLevel: (v) => set({ fxLevel: v }),
      setHintSolverEnabled: (v) => set({ hintSolverEnabled: v }),
      setLiveCoachEnabled: (v) => set({ liveCoachEnabled: v }),
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
      setVoiceCoach: (v) => set({ voiceCoach: v }),
      setFreestyle: (v) => set({ freestyle: v }),
      setVoiceScramble: (v) => set({ voiceScramble: v }),
      setKeepAwake: (v) => set({ keepAwake: v }),
      setCubeNickname: (id, nickname) =>
        set((s) => {
          const next = { ...s.cubeNicknames };
          if (nickname.trim()) next[id] = nickname.trim();
          else delete next[id];
          return { cubeNicknames: next };
        }),
      setStatsScope: (v) => set({ statsScope: v }),
      setTimerMode: (v) => set({ timerMode: v }),
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

// Another tab changed the settings: take its blob rather than keep ours, or the
// next change here would write the whole stale state back over it. Browsers fire
// `storage` only in the *other* tabs, so this never reacts to our own writes.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SETTINGS_KEY) void useSettingsStore.persist.rehydrate();
  });
}

/**
 * First-run FX level for low-power devices (see lib/utils/deviceTier.ts for the
 * heuristic). The store's default stays "insane" so the server render and the
 * client's first render agree; this runs from ClientEnv after hydration, and
 * only when no FX level was ever saved — an existing choice is never changed.
 */
export function applyDeviceFxDefault(): void {
  try {
    const level = firstRunFxLevel({
      alreadyDecided: localStorage.getItem(FX_DECIDED_KEY) !== null,
      rawSettings: settingsAtLoad,
      signals: readDeviceSignals(),
    });
    if (level) useSettingsStore.setState({ fxLevel: level });
    localStorage.setItem(FX_DECIDED_KEY, "1");
  } catch {
    // Storage blocked (private mode, quota): keep the default rather than guess.
  }
}
