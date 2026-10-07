"use client";

import { useMemo, useState } from "react";
import { History, X } from "lucide-react";
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
    <div className="chrome-banner chrome-banner--info" role="status" data-testid="synced-session-notice">
      <History size={16} className="shrink-0 text-accent" aria-hidden="true" />
      <p className="chrome-banner__text">
        Your synced history ({suggestion.count} solves) is in another session.
      </p>
      <button
        type="button"
        onClick={() => {
          void switchSession(suggestion.id);
          dismiss();
        }}
        className="chrome-btn chrome-btn--primary hit-y"
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
        className="chrome-dismiss hit"
        aria-label="Dismiss"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
