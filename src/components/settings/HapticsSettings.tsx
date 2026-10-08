"use client";

import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils/cn";
import { useHapticsLevel } from "@/hooks/useHapticsLevel";
import { hapticsSupported, previewHaptics } from "@/lib/utils/haptics";
import { HAPTIC_LEVELS, HAPTIC_LEVEL_INFO, type HapticsLevel } from "@/lib/utils/hapticsModel";

const noSubscribe = () => () => {};

/**
 * Vibration feedback as one compact section: Off / Light / Full and a Test
 * button. Self-contained (own preference, own storage key) so it can be
 * dropped into any settings panel. Where the browser can't vibrate (iOS
 * Safari, most desktops) it says so instead of offering a dead control.
 */
export function HapticsSettings({ className }: { className?: string }) {
  const [level, setLevel] = useHapticsLevel();
  // null on the server and first paint, so there's no hydration mismatch.
  const supported = useSyncExternalStore(noSubscribe, hapticsSupported, () => null);
  const [note, setNote] = useState("");
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (next: HapticsLevel, focus = false) => {
    setLevel(next);
    setNote("");
    if (focus) refs.current[HAPTIC_LEVELS.indexOf(next)]?.focus();
  };

  // Radio-group keys: arrows move and select, Home/End jump.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = HAPTIC_LEVELS.length - 1;
    let to = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = index === 0 ? last : index - 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = last;
    if (to < 0) return;
    e.preventDefault();
    choose(HAPTIC_LEVELS[to], true);
  };

  const test = () => {
    if (level === "off") return;
    setNote(previewHaptics(level) ? "Buzzed. This is how Light and Full feel at the end of a solve." : "Nothing to buzz: this browser blocked it.");
  };

  const info = HAPTIC_LEVEL_INFO[level];
  return (
    <div className={cn("mt-4 border-t border-border pt-3", className)} data-testid="haptics-settings">
      <p id={`${id}-label`} className="mb-1.5 text-[11px] text-muted-2">
        Haptics
      </p>

      {supported === false ? (
        <p className="text-[11px] leading-relaxed text-muted-2" data-testid="haptics-unsupported">
          This browser can&apos;t vibrate (iOS Safari and most desktops can&apos;t). It works on Android phones in Chrome and Firefox.
        </p>
      ) : (
        <>
          <div className="flex items-stretch gap-1.5">
            <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
              {HAPTIC_LEVELS.map((l, i) => {
                const on = level === l;
                return (
                  <button
                    key={l}
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => choose(l)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    data-testid={`haptics-${l}`}
                    className={cn(
                      "min-h-11 rounded-lg px-2 text-xs font-medium transition-colors",
                      on ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                    )}
                  >
                    {HAPTIC_LEVEL_INFO[l].label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={test}
              disabled={level === "off"}
              data-testid="haptics-test"
              aria-describedby={`${id}-hint`}
              className="min-h-11 min-w-16 shrink-0 rounded-lg bg-bg-panel-2 px-3 text-xs font-medium text-foreground transition-colors hover:bg-bg-panel disabled:text-muted-2 disabled:opacity-60"
            >
              Test
            </button>
          </div>
          <p id={`${id}-hint`} className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
            {info.hint}
          </p>
          <p role="status" aria-live="polite" className={cn("text-[11px] leading-relaxed text-muted-2", !note && "sr-only")}>
            {note}
          </p>
        </>
      )}
    </div>
  );
}
