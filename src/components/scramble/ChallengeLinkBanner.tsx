"use client";

import { useEffect, useRef, useState } from "react";
import { Swords, X } from "lucide-react";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { parseMoves } from "@/lib/analysis/notation";

/**
 * Picks up a `?scramble=` query param — how a "challenge link" arrives —
 * validates it, and offers to load it as the current scramble instead of
 * silently trusting URL content. Anyone can hand-craft this URL, so the
 * value is parsed through the same validator the analyzer uses before it's
 * ever treated as a real scramble; a malformed or empty one is ignored
 * rather than shown as a broken banner.
 */
function readChallengeScramble(): string | null {
  const raw = new URLSearchParams(window.location.search).get("scramble");
  if (!raw) return null;
  const parsed = parseMoves(raw.trim());
  if (parsed.errors.length > 0 || parsed.moves.length === 0) return null;
  return parsed.moves.map((m) => m.token).join(" ");
}

export function ChallengeLinkBanner({ onRace }: { onRace?: () => void }) {
  // The server never sees the query string that matters here (it's a client
  // navigation from a shared link, not a real page load in the SSR sense in
  // spirit — but this page *is* server-rendered on first load, and the
  // server has no `window`). Starting at null keeps the server- and
  // first-client-render markup identical; the real value is picked up in an
  // effect, which is the standard fix for a hydration mismatch on
  // browser-only state, not a stray re-render loop — it runs once on mount
  // and touches nothing that would cause it to run again.
  const [pending, setPending] = useState<string | null>(null);
  const loadExternalScramble = useScrambleStore((s) => s.loadExternalScramble);
  // Dev-mode React runs a fresh mount's effects twice (mount, cleanup,
  // mount again) to surface exactly this kind of bug: reading then
  // stripping a one-shot external signal (the URL) isn't reversible, so a
  // naive cleanup-based guard would have the second pass see an
  // already-stripped URL and find nothing. A ref survives that simulated
  // remount, so it's what actually makes "consume this exactly once" true.
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;

    // Read before stripping — history.replaceState changes window.location
    // immediately, so reading it after would always see an empty query
    // string and never find anything.
    const found = readChallengeScramble();
    if (window.location.search.includes("scramble=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!found) return;
    // Deferred a tick rather than set synchronously in the effect body, and
    // deliberately no cleanup here — there is nothing to undo (the URL
    // stays stripped either way), and a cleanup that cancelled this would
    // reintroduce the exact bug consumedRef exists to prevent.
    setTimeout(() => setPending(found), 0);
  }, []);

  if (!pending) return null;

  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs">
      <Swords size={14} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-foreground/90">
        Someone sent you a scramble to race — <span className="font-mono text-accent">{pending}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          loadExternalScramble(pending);
          setPending(null);
          onRace?.();
        }}
        className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-fg"
      >
        Race it
      </button>
      <button
        type="button"
        onClick={() => setPending(null)}
        aria-label="Dismiss"
        className="tap-target shrink-0 text-muted hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
