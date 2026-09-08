"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeSessionStats } from "@/lib/stats/stats";
import { drawShareCard, canvasToBlob } from "@/lib/share/shareCard";

export function ShareCardButton() {
  const solves = useSessionStore((s) => s.solves);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const [busy, setBusy] = useState(false);

  const sessionName = sessions.find((s) => s.id === activeSessionId)?.name ?? "Session";

  const onShare = async () => {
    setBusy(true);
    try {
      const stats = computeSessionStats(solves);
      const canvas = drawShareCard({ sessionName, stats });
      const blob = await canvasToBlob(canvas);
      if (!blob) return;

      const file = new File([blob], "cube-timer-stats.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Cube Timer stats" });
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cube-timer-stats.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // A cancelled share sheet throws — nothing to surface to the user.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={solves.length === 0 || busy}
      className="flex items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2.5 text-xs font-medium text-foreground/90 hover:brightness-110 disabled:opacity-40"
    >
      <Share2 size={14} /> Share stats
    </button>
  );
}
