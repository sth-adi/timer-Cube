"use client";

import { Trash2 } from "lucide-react";

/**
 * A small "delete this solve" button for right under a just-finished time — a mis-scramble, a
 * false start, a fumbled stop. One tap removes it (the undo toast brings it back), and the button
 * turns into a quiet "Deleted" so it can't be hit twice. Both timers use it.
 */
export function QuickDelete({ deleted, onDelete }: { deleted: boolean; onDelete: () => void }) {
  if (deleted) return <p className="text-[11px] text-muted-2">Deleted</p>;
  return (
    <button
      type="button"
      onClick={onDelete}
      // The timer surface starts a hold on any touch (and cancels the tap that follows), so a press
      // on this button must not reach it.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className="hit-y flex items-center gap-1 rounded-full bg-bg-panel-2 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-danger/15 hover:text-danger active:bg-danger/15 active:text-danger"
      title="Delete this solve (undo from the toast)"
      data-testid="quick-delete"
    >
      <Trash2 size={12} /> Delete solve
    </button>
  );
}
