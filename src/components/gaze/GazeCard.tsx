"use client";

import { ScanEye } from "lucide-react";
import { FaceletNet } from "@/components/scramble/ScrambleNet";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { FACES, MIN_LOOK_MS, faceColorName, type GazeReport } from "@/lib/gaze/gaze";
import { cn } from "@/lib/utils/cn";

/** Where your eyes went during inspection, from the gyro — and which cross edges they missed. */
export function GazeCard({ report, facelets }: { report: GazeReport; facelets: string }) {
  const maxMs = Math.max(1, ...FACES.map((f) => report.faceMs[f]));
  const ring = report.hidden.flatMap((e) => e.facelets);
  return (
    <div className="card flex w-full flex-col gap-3 rounded-xl p-3">
      <div className="flex flex-col gap-0.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ScanEye size={13} className="text-accent" /> Inspection gaze
          <span className="font-normal text-muted-2">
            · saw {report.seen.length}/6 sides in {(report.durationMs / 1000).toFixed(1)}s
          </span>
        </p>
        <p className={cn("text-[11px]", report.hidden.length ? "text-warning" : "text-success")}>{report.headline}</p>
      </div>

      <div className="flex items-start gap-3">
        <div className="w-36 shrink-0">
          <FaceletNet facelets={facelets} dimFaces={report.unseen} ringFacelets={ring} className="w-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {FACES.map((f) => (
            <div key={f} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] ring-1 ring-black/30" style={{ background: FACELET_COLORS[f] }} />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-panel-2">
                <div
                  className={cn("h-full rounded-full", report.faceMs[f] >= MIN_LOOK_MS ? "bg-accent" : "bg-muted-2/40")}
                  style={{ width: `${(report.faceMs[f] / maxMs) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-[10px] tabular-nums text-muted-2">{(report.faceMs[f] / 1000).toFixed(1)}s</span>
            </div>
          ))}
        </div>
      </div>

      {report.timeline.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Side facing you, second by second</p>
          <div className="flex h-3 overflow-hidden rounded-full">
            {report.timeline.map((seg, i) => (
              <span
                key={i}
                title={`${faceColorName(seg.front)} front, ${faceColorName(seg.top)} top`}
                style={{ flexGrow: Math.max(1, seg.toMs - seg.fromMs), background: FACELET_COLORS[seg.front] }}
              />
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-2">Faded sides were never turned toward you. Outlined stickers are cross edges you couldn&apos;t have seen.</p>
    </div>
  );
}
