"use client";

import { useEffect } from "react";
import { Undo2 } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";

const SHOW_MS = 8000;

function inField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
}

/**
 * "Solve deleted — Undo", for a few seconds after anything is removed, from
 * anywhere in the app. Ctrl/Cmd+Z does the same while it's showing. Deleting
 * is otherwise permanent (and syncs as a deletion), so this is the net under it.
 * Each Undo puts back the newest deletion and shows the one before it, up to
 * UNDO_DEPTH deep ("Undo (3)" says how many are left); letting it time out
 * forgets them all.
 */
export function UndoToast() {
  const stack = useSessionStore((s) => s.undoStack);
  const removed = stack.at(-1) ?? null;
  const undo = useSessionStore((s) => s.undoRemove);
  const dismiss = useSessionStore((s) => s.dismissUndo);

  useEffect(() => {
    if (!removed) return undefined;
    const timer = setTimeout(dismiss, SHOW_MS);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !inField(e.target)) {
        e.preventDefault();
        void undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
    // Keyed on the newest removal, so another delete or an undo restarts the countdown.
  }, [removed?.id, removed, undo, dismiss]);

  if (!removed) return null;
  const n = removed.solves.length;
  const depth = stack.length;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4" style={{ bottom: "calc(var(--nav-height) + var(--safe-bottom) + 64px)" }}>
      <div role="status" className="card pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 text-sm shadow-lg" data-testid="undo-toast">
        <span className="text-foreground">{n === 1 ? "Solve deleted" : `${n} solves deleted`}</span>
        <button type="button" onClick={() => void undo()} className="flex items-center gap-1 font-semibold text-accent hover:underline" data-testid="undo-button">
          <Undo2 size={14} /> Undo{depth > 1 ? ` (${depth})` : ""}
        </button>
      </div>
    </div>
  );
}
