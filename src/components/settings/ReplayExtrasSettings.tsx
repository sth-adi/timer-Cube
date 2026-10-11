"use client";

import { cn } from "@/lib/utils/cn";
import { STAGE_BACKGROUNDS, useSettingsStore, type StageBackground } from "@/lib/store/settingsStore";

const LABELS: Record<StageBackground, string> = { theme: "Theme", cobalt: "Cobalt", black: "Black", light: "Light" };

/** Replay extras: the colour of the stage behind the replay cube, and a tiny vibration on each turn snap. */
export function ReplayExtrasSettings() {
  const stageBackground = useSettingsStore((s) => s.stageBackground);
  const setStageBackground = useSettingsStore((s) => s.setStageBackground);
  const replayHaptics = useSettingsStore((s) => s.replayHaptics);
  const setReplayHaptics = useSettingsStore((s) => s.setReplayHaptics);
  return (
    <div className="mt-4 border-t border-border pt-3" data-testid="replay-extras-settings">
      <p className="mb-1.5 text-xs font-medium text-muted">Replay stage background</p>
      <div role="radiogroup" aria-label="Replay stage background" className="grid grid-cols-4 gap-1.5">
        {STAGE_BACKGROUNDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={stageBackground === id}
            onClick={() => setStageBackground(id)}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-xs font-medium",
              stageBackground === id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-bg-panel-2",
            )}
          >
            {LABELS[id]}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span>Replay turn haptics</span>
        <input type="checkbox" checked={replayHaptics} onChange={(e) => setReplayHaptics(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
      </label>
    </div>
  );
}
