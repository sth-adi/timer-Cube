"use client";

import { useSessionStore } from "@/lib/store/sessionStore";
import { EVENT_TAGS } from "@/types";
import { cn } from "@/lib/utils/cn";

/**
 * Which practice category the next solve counts as. Sticky rather than
 * reset per-solve — most people do a run of OH solves together, not one at
 * a time — but not persisted across reloads, so a session never silently
 * reopens mid-OH-practice with no visible indicator of why the times look
 * off from normal.
 */
export function EventTagSelector() {
  const pendingEvent = useSessionStore((s) => s.pendingEvent);
  const setPendingEvent = useSessionStore((s) => s.setPendingEvent);

  return (
    <div className="flex items-center justify-center gap-1 px-4">
      <button
        type="button"
        onClick={() => setPendingEvent(null)}
        aria-pressed={pendingEvent === null}
        className={cn(
          "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
          pendingEvent === null ? "bg-accent-soft text-accent" : "text-muted-2 hover:text-muted",
        )}
      >
        Normal
      </button>
      {EVENT_TAGS.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => setPendingEvent(tag.id)}
          aria-pressed={pendingEvent === tag.id}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
            pendingEvent === tag.id ? "bg-accent-soft text-accent" : "text-muted-2 hover:text-muted",
          )}
        >
          {tag.label}
        </button>
      ))}
    </div>
  );
}
