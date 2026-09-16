"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Ambient "how many people have this open right now" counter, via Supabase
 * Realtime presence — no account needed, each open tab just tracks itself
 * under a random key on a shared channel; the count is everyone else's tab
 * count too. Purely decorative social proof, nothing here ever blocks or
 * gates the app: renders nothing until a presence sync actually comes back
 * (so it never flashes a wrong "1" before the real count arrives), and
 * silently does nothing at all when Supabase isn't configured.
 */
export function OnlinePresenceBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase.channel("presence-cubers", {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        setCount(Object.keys(channel.presenceState()).length);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ online_at: Date.now() });
      });

    return () => {
      void supabase.removeChannel(channel);
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
