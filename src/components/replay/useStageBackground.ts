import { useSettingsStore } from "@/lib/store/settingsStore";

/** The stage field setting as a data attribute value: undefined for "theme" (the per-theme colour in replaystage.css). */
export function useStageBackground(): string | undefined {
  const bg = useSettingsStore((s) => s.stageBackground);
  return bg === "theme" ? undefined : bg;
}
