"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { useCloudSyncStore } from "@/lib/store/cloudSyncStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { suggestSession } from "@/lib/db/sessionSuggestion";

const DISMISSED_KEY = "cube-timer:dismissed-session-suggestion";

function wasDismissed(id: string): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === id;
  } catch {
    return false;
  }
}

/**
 * On a new device the account's history arrives under its own session while the app opens this
 * device's fresh, empty one — so stats look blank even though everything synced. This says where
 * the solves are and switches to them in one tap.
 */
export function SyncedSessionNotice() {
  const flagged = useCloudSyncStore((s) => s.suggestion);
  const sessions = useSessionStore((s) => s.sessions);
  const allSolves = useSessionStore((s) => s.allSolves);
  const activeId = useSessionStore((s) => s.activeSessionId);
  // A sync raises the flag; whether it still applies is re-checked against what's open right now,
  // so switching (or merging) away makes it disappear on its own.
  const suggestion = useMemo(() => (flagged ? suggestSession(sessions, allSolves, activeId) : null), [flagged, sessions, allSolves, activeId]);
  const dismiss = useCloudSyncStore((s) => s.dismissSuggestion);
  const switchSession = useSessionStore((s) => s.switchSession);
  const [, bump] = useState(0);

  if (!suggestion || wasDismissed(suggestion.id)) return null;
  return (
    <div className="mx-3 mt-1 flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs sm:mx-4" role="status" data-testid="synced-session-notice">
      <History size={14} className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1 leading-snug text-foreground">
        Your synced history ({suggestion.count} solves) is in another session.
      </p>
      <button
        type="button"
        onClick={() => {
          void switchSession(suggestion.id);
          dismiss();
        }}
        className="hit-y shrink-0 rounded-full bg-accent px-3 py-1 font-semibold text-accent-fg"
      >
        Open it
      </button>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISSED_KEY, suggestion.id);
          } catch {
            // Without storage it just reappears after the next sync.
          }
          bump((n) => n + 1);
          dismiss();
        }}
        className="hit-y shrink-0 px-1 text-muted-2 hover:text-muted"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
