"use client";

import { useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import { BACKGROUND_STYLES, PHASE_COUNTS, PHASE_LABELS, THEMES, TIMER_STYLES, useSettingsStore } from "@/lib/store/settingsStore";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { PRACTICE_SCRAMBLE_LENGTHS } from "@/lib/cube-engine/practiceScramble";
import { useSessionStore } from "@/lib/store/sessionStore";
import { looksLikeCsTimerExport, parseCsTimerExport, type CsTimerParsed } from "@/lib/utils/csTimerImport";
import { DeviceSyncPanel } from "./DeviceSyncPanel";
import { AccountPanel } from "./AccountPanel";
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
  const practiceMode = useScrambleStore((s) => s.practiceMode);
  const setPracticeMode = useScrambleStore((s) => s.setPracticeMode);
  const practiceLength = useScrambleStore((s) => s.practiceLength);
  const setPracticeLength = useScrambleStore((s) => s.setPracticeLength);
  const inspectionEnabled = useSettingsStore((s) => s.inspectionEnabled);
  const setInspectionEnabled = useSettingsStore((s) => s.setInspectionEnabled);
  const hintSolverEnabled = useSettingsStore((s) => s.hintSolverEnabled);
  const setHintSolverEnabled = useSettingsStore((s) => s.setHintSolverEnabled);
  const liveCoachEnabled = useSettingsStore((s) => s.liveCoachEnabled);
  const setLiveCoachEnabled = useSettingsStore((s) => s.setLiveCoachEnabled);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const backgroundStyle = useSettingsStore((s) => s.backgroundStyle);
  const setBackgroundStyle = useSettingsStore((s) => s.setBackgroundStyle);
  const timerStyle = useSettingsStore((s) => s.timerStyle);
  const setTimerStyle = useSettingsStore((s) => s.setTimerStyle);
  const holdToStartMs = useSettingsStore((s) => s.holdToStartMs);
  const setHoldToStartMs = useSettingsStore((s) => s.setHoldToStartMs);
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);
  const setDailyGoal = useSettingsStore((s) => s.setDailyGoal);
  const hideTimeWhileSolving = useSettingsStore((s) => s.hideTimeWhileSolving);
  const phaseCount = useSettingsStore((s) => s.phaseCount);
  const setPhaseCount = useSettingsStore((s) => s.setPhaseCount);
  const setHideTimeWhileSolving = useSettingsStore((s) => s.setHideTimeWhileSolving);

  const exportActiveSession = useSessionStore((s) => s.exportActiveSession);
  const importIntoActiveSession = useSessionStore((s) => s.importIntoActiveSession);
  const importRowsIntoActiveSession = useSessionStore((s) => s.importRowsIntoActiveSession);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // Set only when the uploaded file is a csTimer export with more than one
  // session — this app's own imports and single-session csTimer files never
  // need a choice, so the picker only appears when one is actually needed.
  const [csTimerPending, setCsTimerPending] = useState<CsTimerParsed | null>(null);

  const onImportFile = async (file: File) => {
    setCsTimerPending(null);
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      if (looksLikeCsTimerExport(raw)) {
        const parsed = parseCsTimerExport(raw);
        if (parsed.sessions.length === 1) {
          const count = await importRowsIntoActiveSession(parsed.solvesByKey[parsed.sessions[0].key]);
          setImportMsg(`Imported ${count} solve${count === 1 ? "" : "s"} from csTimer.`);
        } else {
          setCsTimerPending(parsed);
        }
        return;
      }
      const count = await importIntoActiveSession(text);
      setImportMsg(`Imported ${count} solve${count === 1 ? "" : "s"}.`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import failed.");
    }
  };

  const onPickCsTimerSession = async (key: string) => {
    if (!csTimerPending) return;
    const rows = csTimerPending.solvesByKey[key];
    const count = await importRowsIntoActiveSession(rows);
    setImportMsg(`Imported ${count} solve${count === 1 ? "" : "s"} from csTimer.`);
    setCsTimerPending(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cn(
          "glass-panel w-full rounded-t-2xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-sheet-in max-h-[88vh] overflow-y-auto",
          "sm:max-w-sm sm:rounded-2xl sm:pb-5 sm:animate-fade-in-up",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-2 text-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">Appearance</p>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                aria-pressed={theme === t.id}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-colors",
                  theme === t.id ? "border-accent bg-accent-soft" : "border-border hover:bg-bg-panel-2",
                )}
              >
                <span
                  className="h-5 w-5 rounded-full border border-border-strong"
                  style={{ background: t.swatch }}
                />
                <span className="text-[10px] leading-none text-muted">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">Background</p>
          <div className="grid grid-cols-5 gap-1.5">
            {BACKGROUND_STYLES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBackgroundStyle(b.id)}
                aria-pressed={backgroundStyle === b.id}
                className={cn(
                  "rounded-lg border px-1 py-2 text-center text-[10px] font-medium leading-none transition-colors",
                  backgroundStyle === b.id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-bg-panel-2",
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">Timer style</p>
          <div className="grid grid-cols-4 gap-1.5">
            {TIMER_STYLES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTimerStyle(t.id)}
                aria-pressed={timerStyle === t.id}
                className={cn(
                  "rounded-lg border px-1 py-2 text-center text-[10px] font-medium leading-none transition-colors",
                  timerStyle === t.id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-bg-panel-2",
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 divide-y divide-border border-t border-border pt-1">
          <Toggle checked={inspectionEnabled} onChange={setInspectionEnabled} label="WCA 15s inspection" />
          <Toggle checked={hintSolverEnabled} onChange={setHintSolverEnabled} label="Solve hints (cross / CFOP)" />
          <Toggle checked={liveCoachEnabled} onChange={setLiveCoachEnabled} label="Live coach between solves" />
          <Toggle checked={soundEnabled} onChange={setSoundEnabled} label="Sound on solve" />
          <Toggle
            checked={hideTimeWhileSolving}
            onChange={setHideTimeWhileSolving}
            label="Hide time while solving"
          />
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">Phase splits</p>
          <div className="flex gap-1.5">
            {PHASE_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setPhaseCount(count)}
                aria-pressed={phaseCount === count}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                  phaseCount === count
                    ? "bg-accent-soft text-accent"
                    : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                {count === 1 ? "Off" : `${count}`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
            {phaseCount === 1
              ? "One press stops the timer, as usual."
              : `Press ${phaseCount} times: ${PHASE_LABELS[phaseCount].join(" → ")}. The last press stops the clock, and Stats shows where your time actually goes.`}
          </p>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <Toggle checked={practiceMode} onChange={setPracticeMode} label="Practice scrambles (custom length)" />
          {practiceMode && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRACTICE_SCRAMBLE_LENGTHS.map((len) => (
                <button
                  key={len}
                  type="button"
                  onClick={() => setPracticeLength(len)}
                  aria-pressed={practiceLength === len}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    practiceLength === len
                      ? "bg-accent-soft text-accent"
                      : "bg-bg-panel-2 text-muted hover:text-foreground",
                  )}
                >
                  {len}
                </button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
            {practiceMode
              ? "Random-move scrambles at a fixed length you pick — not WCA-legal, and never scored against official stats. Good for drilling lookahead on long scrambles or isolating a stage on short ones."
              : "Off, 3x3 uses random-state scrambles, the same kind competitions use. (2x2, 4x4 and 5x5 always use random-move scrambles.)"}
          </p>
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

        <div className="mt-3">
          <label className="flex items-center justify-between py-2 text-sm text-foreground/90">
            Daily practice goal
            <span className="text-muted-2 tabular-timer">{dailyGoal} solves</span>
          </label>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">Session data</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => exportActiveSession()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-medium text-foreground/90 hover:brightness-110"
            >
              <Download size={13} /> Export JSON
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-medium text-foreground/90 hover:brightness-110"
            >
              <Upload size={13} /> Import JSON
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
            Accepts this app&apos;s own export, or a csTimer export — both go straight into the current session.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.target.value = "";
            }}
          />
          {csTimerPending && (
            <div className="mt-2 rounded-lg bg-bg-panel-2 p-2.5">
              <p className="mb-1.5 text-[11px] text-muted-2">
                This csTimer file has {csTimerPending.sessions.length} sessions — pick one to import into{" "}
                <span className="text-foreground/80">the current session</span>:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {csTimerPending.sessions.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => void onPickCsTimerSession(s.key)}
                    className="rounded-lg bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-foreground/90 hover:brightness-110"
                  >
                    {s.name} <span className="text-muted-2">({s.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {importMsg && <p className="mt-1.5 text-xs text-muted-2">{importMsg}</p>}
        </div>

        <AccountPanel />
        <DeviceSyncPanel />

        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-2">Keyboard shortcuts</p>
          <ul className="space-y-1 text-xs text-muted">
            <li>
              <kbd className="rounded bg-bg-panel-2 px-1.5 py-0.5 font-mono">Space</kbd> hold to start, tap to stop
            </li>
            <li>
              <kbd className="rounded bg-bg-panel-2 px-1.5 py-0.5 font-mono">Esc</kbd> cancel the current arm/hold
            </li>
            <li>
              <kbd className="rounded bg-bg-panel-2 px-1.5 py-0.5 font-mono">Delete</kbd> remove the most recent solve
            </li>
            <li>
              <kbd className="rounded bg-bg-panel-2 px-1.5 py-0.5 font-mono">1</kbd>–
              <kbd className="rounded bg-bg-panel-2 px-1.5 py-0.5 font-mono">5</kbd> jump to Timer / Trainer / Analyze /
              Stats / Solves
            </li>
            <li>
              <kbd className="rounded bg-bg-panel-2 px-1.5 py-0.5 font-mono">?</kbd> toggle this panel
            </li>
            <li>
              <kbd className="rounded bg-bg-panel-2 px-1.5 py-0.5 font-mono">↑↓←→</kbd> rotate a focused 3D cube view
              (or tap its <span className="text-foreground/80">⌖</span> icon to steer it by tilting your phone)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
