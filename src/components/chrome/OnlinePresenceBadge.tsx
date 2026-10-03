"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";

/** A tab hidden this long closes its presence socket; brief tab switches don't. */
const HIDDEN_GRACE_MS = 30_000;
/** Waits this long after coming back (visible / online) before reconnecting, so a flapping connection can't cause a reconnect storm. */
const RECONNECT_DELAY_MS = 1_500;

/**
 * Ambient "how many people have this open right now" counter, via Supabase
 * Realtime presence — no account needed, each open tab just tracks itself
 * under a random key on a shared channel; the count is everyone else's tab
 * count too. Purely decorative social proof, nothing here ever blocks or
 * gates the app: renders nothing until a presence sync actually comes back
 * (so it never flashes a wrong "1" before the real count arrives), and
 * silently does nothing at all when Supabase isn't configured.
 *
 * The websocket is only held open while it's useful: the channel is removed
 * when the browser goes offline, or once the tab has been hidden for
 * HIDDEN_GRACE_MS (a held-open socket keeps the radio awake on phones), and
 * is re-joined when the tab is visible and online again. The count is hidden
 * while disconnected rather than shown stale.
 */
export function OnlinePresenceBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const key = crypto.randomUUID();
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let joining = false;
    // The previous channel's removal; a new join waits for it, since both share one topic.
    let removal: Promise<unknown> = Promise.resolve();
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let joinTimer: ReturnType<typeof setTimeout> | undefined;

    const canRun = () => navigator.onLine && document.visibilityState === "visible";

    const join = () => {
      if (channel || joining) return;
      joining = true;
      void removal.then(() => {
        joining = false;
        if (disposed || channel || !canRun()) return;
        const ch = supabase.channel("presence-cubers", { config: { presence: { key } } });
        channel = ch;
        ch.on("presence", { event: "sync" }, () => {
          if (channel === ch) setCount(Object.keys(ch.presenceState()).length);
        }).subscribe((status) => {
          if (status === "SUBSCRIBED" && channel === ch) void ch.track({ online_at: Date.now() });
        });
      });
    };

    const leave = () => {
      if (!channel) return;
      const ch = channel;
      channel = null;
      setCount(null);
      removal = supabase.removeChannel(ch).catch(() => undefined);
    };

    const clearTimers = () => {
      clearTimeout(hideTimer);
      clearTimeout(joinTimer);
      hideTimer = undefined;
      joinTimer = undefined;
    };

    const update = () => {
      if (!navigator.onLine) {
        clearTimers();
        leave();
      } else if (document.visibilityState === "hidden") {
        clearTimeout(joinTimer);
        joinTimer = undefined;
        if (channel && hideTimer === undefined) {
          hideTimer = setTimeout(() => {
            hideTimer = undefined;
            leave();
          }, HIDDEN_GRACE_MS);
        }
      } else {
        clearTimeout(hideTimer);
        hideTimer = undefined;
        if (!channel && joinTimer === undefined) {
          joinTimer = setTimeout(() => {
            joinTimer = undefined;
            join();
          }, RECONNECT_DELAY_MS);
        }
      }
    };

    if (canRun()) join();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      disposed = true;
      clearTimers();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
  }, []);

  if (count === null || count < 1) return null;

  return (
    <div
      className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-2 py-1 text-[11px] text-muted"
      title="Cubers with the app open right now"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
      <Users size={11} className="shrink-0" />
      <span className="tabular-nums">{count}</span>
    </div>
  );
}
