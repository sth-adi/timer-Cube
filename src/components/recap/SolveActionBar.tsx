"use client";

import { useState } from "react";
import { Check, Link2, Loader2, MessageSquare, MoreHorizontal, Trash2 } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useShareSolve } from "@/hooks/useShareSolve";
import { cn } from "@/lib/utils/cn";
import type { Penalty, Solve } from "@/types";

const ICON_BUTTON = "flex min-h-10 min-w-10 items-center justify-center rounded-md transition-colors";

/**
 * What you can do to the solve itself, from its recap: +2 / DNF, a note, a
 * share link and delete — the same store actions the row popup uses (a delete
 * is undone from the toast). "More" hands over to that popup for the rest.
 */
export function SolveActionBar({ solve, onMore, onDeleted }: { solve: Solve; onMore?: () => void; onDeleted: () => void }) {
  const setPenalty = useSessionStore((s) => s.setPenalty);
  const setComment = useSessionStore((s) => s.setComment);
  const removeSolve = useSessionStore((s) => s.removeSolve);
  const { shareable, state: shareState, share } = useShareSolve(solve);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(solve.comment ?? "");

  const cyclePenalty = (p: Penalty) => void setPenalty(solve.id, p === solve.penalty ? "none" : p);
  const saveNote = () => {
    if (draft !== (solve.comment ?? "")) void setComment(solve.id, draft);
  };

  const shareLabel = shareState === "copied" ? "Link copied" : shareState === "error" ? "Could not create a link" : "Copy a share link";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="-mx-1 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => cyclePenalty("plus2")}
          aria-pressed={solve.penalty === "plus2"}
          className={cn(ICON_BUTTON, "px-2 text-xs font-medium", solve.penalty === "plus2" ? "bg-warning/20 text-warning" : "text-muted hover:text-foreground")}
        >
          +2
        </button>
        <button
          type="button"
          onClick={() => cyclePenalty("dnf")}
          aria-pressed={solve.penalty === "dnf"}
          className={cn(ICON_BUTTON, "px-2 text-xs font-medium", solve.penalty === "dnf" ? "bg-danger/20 text-danger" : "text-muted hover:text-foreground")}
        >
          DNF
        </button>
        <button
          type="button"
          onClick={() => setNoteOpen((o) => !o)}
          aria-expanded={noteOpen}
          aria-label={solve.comment ? "Edit note" : "Add note"}
          title={solve.comment ? "Edit note" : "Add note"}
          className={cn(ICON_BUTTON, noteOpen || solve.comment ? "text-accent" : "text-muted hover:text-foreground")}
        >
          <MessageSquare size={15} />
        </button>
        {shareable && (
          <button
            type="button"
            onClick={() => void share()}
            disabled={shareState === "busy"}
            aria-label={shareLabel}
            title={shareLabel}
            className={cn(ICON_BUTTON, shareState === "copied" ? "text-success" : shareState === "error" ? "text-danger" : "text-muted hover:text-accent")}
          >
            {shareState === "busy" ? <Loader2 size={15} className="animate-spin" /> : shareState === "copied" ? <Check size={15} /> : <Link2 size={15} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onDeleted();
            void removeSolve(solve.id);
          }}
          aria-label="Delete solve"
          title="Delete (undo from the toast)"
          className={cn(ICON_BUTTON, "text-muted hover:text-danger")}
        >
          <Trash2 size={15} />
        </button>
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            aria-label="More actions"
            className="ml-auto flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:text-foreground"
          >
            <MoreHorizontal size={15} /> More
          </button>
        )}
      </div>
      {noteOpen && (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            // Escape closes the sheet, and an unmounting input never blurs: keep what was typed.
            if (e.key === "Escape") saveNote();
          }}
          aria-label="Solve note"
          placeholder="Add a note…"
          className="min-h-10 w-full rounded-md border border-border bg-bg-panel-2 px-2 py-1 text-[16px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none sm:min-h-0 sm:text-xs"
        />
      )}
    </div>
  );
}
