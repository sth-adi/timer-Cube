"use client";

import { useMemo } from "react";
import { Gauge } from "lucide-react";
import type { Solve } from "@/types";
import { computeFaceSpeedFingerprint } from "@/lib/analysis/smartCubeInsights";

/**
 * Which face costs you the most time per turn, averaged across every
 * smart-cube-captured solve. Pure client-side stat — no re-analysis, just
 * the real per-move timestamps a smart cube already gave us.
 */
export function FaceSpeedFingerprintCard({ solves }: { solves: Solve[] }) {
  const faces = useMemo(() => computeFaceSpeedFingerprint(solves), [solves]);

  if (faces.length < 2) return null;

  const sorted = [...faces].sort((a, b) => a.avgGapMs - b.avgGapMs);
  const max = Math.max(...sorted.map((f) => f.avgGapMs));

  return (
    <div className="card rounded-xl p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Gauge size={14} className="text-accent" />
        Turn-speed fingerprint
      </h3>
      <div className="space-y-1.5">
        {sorted.map((f) => (
          <div key={f.face} className="flex items-center gap-2 text-xs">
            <span className="w-4 shrink-0 font-mono font-semibold text-foreground/90">{f.face}</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
              <div
                className="absolute inset-y-0 left-0 rounded bg-accent/60"
                style={{ width: `${max > 0 ? (f.avgGapMs / max) * 100 : 0}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-muted-2">
              {Math.round(f.avgGapMs)}ms · ×{f.turnCount}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-2">
        Average time each face&apos;s turns took, from your smart-cube solves&apos; real move timing — longest bar is
        your bottleneck face.
      </p>
    </div>
  );
}
