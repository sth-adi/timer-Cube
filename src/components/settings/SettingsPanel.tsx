"use client";

import { X } from "lucide-react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { cn } from "@/lib/utils/cn";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-2.5"
    >
      <span className="text-sm text-foreground/90">{label}</span>
      <span
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-bg-panel-2 border border-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-4.5 left-0.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const inspectionEnabled = useSettingsStore((s) => s.inspectionEnabled);
  const setInspectionEnabled = useSettingsStore((s) => s.setInspectionEnabled);
  const hintSolverEnabled = useSettingsStore((s) => s.hintSolverEnabled);
  const setHintSolverEnabled = useSettingsStore((s) => s.setHintSolverEnabled);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const holdToStartMs = useSettingsStore((s) => s.holdToStartMs);
  const setHoldToStartMs = useSettingsStore((s) => s.setHoldToStartMs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="glass-panel w-full max-w-sm rounded-2xl p-5 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="divide-y divide-border">
          <Toggle checked={inspectionEnabled} onChange={setInspectionEnabled} label="WCA 15s inspection" />
          <Toggle checked={hintSolverEnabled} onChange={setHintSolverEnabled} label="Solve hints (cross / CFOP)" />
          <Toggle checked={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} label="Dark theme" />
        </div>

        <div className="mt-3">
          <label className="flex items-center justify-between py-2 text-sm text-foreground/90">
            Hold-to-start
            <span className="text-muted-2 tabular-timer">{holdToStartMs}ms</span>
          </label>
          <input
            type="range"
            min={0}
            max={800}
            step={50}
            value={holdToStartMs}
            onChange={(e) => setHoldToStartMs(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>
      </div>
    </div>
  );
}
