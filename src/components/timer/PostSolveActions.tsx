"use client";

import { useRef, useState } from "react";
import { StickyNote } from "lucide-react";
import type { Penalty, Solve } from "@/types";
import { useSessionStore } from "@/lib/store/sessionStore";
import { cn } from "@/lib/utils/cn";
import { PenaltyControls } from "./SessionStrip";
import { QuickDelete } from "./QuickDelete";

// The timer surface starts a hold on any touch (and cancels the tap that follows), so presses on
// these controls must not reach it.
const stopTouch = {
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
};

/** Inline add/edit for the solve's comment. Enter or blur saves, Esc cancels. */
function NoteEditor({ initial, onSave, onClose }: { initial: string; onSave: (comment: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  // Esc closes the input, which blurs it — this keeps that blur from saving what was just cancelled.
  const doneRef = useRef(false);
  const finish = (save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save && draft.trim() !== initial.trim()) onSave(draft.trim());
    onClose();
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        // Typing here must never reach the timer's own key handling (space starts a run).
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      maxLength={200}
      placeholder="Add a note…"
      aria-label="Solve note"
      className="w-48 max-w-full rounded-full border border-border bg-bg-panel-2 px-3 py-1.5 text-[16px] text-foreground outline-none focus:border-accent sm:text-[11px]"
      data-testid="solve-note-input"
    />
  );
}

/**
 * Compact row under a just-finished time: +2 / DNF toggles, a note, and delete. Acts on the solve
 * that was just saved (the session's last one); once deleted it collapses to a quiet "Deleted".
 */
export function PostSolveActions({
  solve,
  deleted,
  onDelete,
}: {
  solve: Solve | undefined;
  deleted: boolean;
  onDelete: () => void;
}) {
  const setPenalty = useSessionStore((s) => s.setPenalty);
  const setComment = useSessionStore((s) => s.setComment);
  const [editing, setEditing] = useState(false);

  if (deleted || !solve) return <QuickDelete deleted={deleted} onDelete={onDelete} />;

  const hasNote = Boolean(solve.comment);
  return (
    <div className="flex flex-col items-center gap-2" data-testid="post-solve-actions" {...stopTouch}>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="[&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs">
          <PenaltyControls solve={solve} onSet={(p: Penalty) => void setPenalty(solve.id, p)} />
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-pressed={hasNote}
          className={cn(
            "hit-y flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            hasNote ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
          )}
          title={hasNote ? `Note: ${solve.comment}` : "Add a note to this solve"}
          data-testid="solve-note-button"
        >
          <StickyNote size={12} /> Note
        </button>
        <QuickDelete deleted={false} onDelete={onDelete} />
      </div>
      {editing && (
        <NoteEditor
          key={solve.id}
          initial={solve.comment ?? ""}
          onSave={(c) => void setComment(solve.id, c)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
