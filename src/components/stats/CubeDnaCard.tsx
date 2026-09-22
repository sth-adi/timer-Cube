"use client";

import { useMemo, useState } from "react";
import { Dna, Loader2, Share2 } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { computeDnaAxes, MIN_SOLVES_FOR_DNA } from "@/lib/stats/dna";
import { drawDnaCard } from "@/lib/share/dnaCard";
import { canvasToBlob } from "@/lib/share/shareCard";
import { RadarChart } from "./RadarChart";

/**
 * A solver's "DNA": a radar chart built entirely from ratios against their
 * own personal bests (see lib/stats/dna.ts) — a shareable identity poster
 * instead of another table of numbers. Every axis reads the same way
 * regardless of raw speed, so a first-week cuber's chart is just as
 * legitimate a "fingerprint" as a sub-10 solver's.
 */
export function CubeDnaCard() {
  const solves = useSessionStore((s) => s.solves);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const [busy, setBusy] = useState(false);
  const sessionName = sessions.find((s) => s.id === activeSessionId)?.name ?? "Session";

  const axes = useMemo(() => computeDnaAxes(solves), [solves]);

  const onShare = async () => {
    setBusy(true);
    try {
      const canvas = drawDnaCard({ sessionName, axes });
      const blob = await canvasToBlob(canvas);
      if (!blob) return;
      const file = new File([blob], "cube-dna.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Cube DNA" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cube-dna.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // A cancelled share sheet throws — nothing to surface to the user.
    } finally {
      setBusy(false);
    }
  };

  if (solves.length < MIN_SOLVES_FOR_DNA) {
    return (
      <div className="card rounded-xl p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Dna size={14} className="text-accent" />
          Cube DNA
        </h3>
        <p className="text-xs text-muted-2">
          {MIN_SOLVES_FOR_DNA - solves.length} more solve{MIN_SOLVES_FOR_DNA - solves.length === 1 ? "" : "s"} and your
          fingerprint unlocks.
        </p>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in-up rounded-xl p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Dna size={14} className="text-accent" />
          Cube DNA
        </h3>
        <button
          type="button"
          onClick={() => void onShare()}
          disabled={busy}
          className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-accent disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Share2 size={11} />}
          Poster
        </button>
      </div>
      <p className="mb-2 text-[11px] text-muted-2">
        Every axis is a ratio against your own personal best — 100 means your average already matches your peak.
      </p>
      <RadarChart axes={axes} className="mx-auto w-full max-w-[260px]" />
    </div>
  );
}
