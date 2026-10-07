"use client";

import { useId } from "react";
import { paceAreaPath, paceAt, paceLinePath, type PaceCurve } from "@/lib/analysis/paceCurve";

const W = 100;
const H = 20;

/**
 * Where the time went, drawn over the replay scrubber: the solve's turns per second as a small single-hue
 * curve on the scrubber's own timeline, the long pauses as bars on its baseline, the CFOP phase ticks, and
 * the playhead. What has been played is filled a little stronger, and the readout beside it names the pace
 * (or the pause) under the playhead, so dragging the scrubber reads straight off the curve.
 *
 * `inset` lines the curve's ends up with the slider thumb's centre at each end, not with the track's edges.
 */
export function ReplayPaceCurve({ curve, frac, ticks, inset }: { curve: PaceCurve; frac: number; ticks: readonly number[]; inset: number }) {
  const clipId = useId();
  const here = paceAt(curve, frac);
  const readout = here.pause ? `pause ${(here.pause.ms / 1000).toFixed(1)}s` : `${here.tps.toFixed(1)} turns/s`;
  const pauseCount = curve.pauses.length;
  const label = `Pace through the solve: peaks at ${curve.peakTps.toFixed(1)} turns per second${
    pauseCount ? `, ${pauseCount} long pause${pauseCount === 1 ? "" : "s"}` : ""
  }`;
  return (
    <div className="w-full" data-testid="replay-pace">
      <div className="flex h-3.5 items-baseline justify-between px-2 text-[10px] font-medium uppercase leading-3.5 tracking-wide text-muted-2" aria-hidden>
        <span>Pace</span>
        <span className="normal-case tabular-nums tracking-normal">{readout}</span>
      </div>
      <div style={{ paddingLeft: inset, paddingRight: inset }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-5 w-full overflow-visible text-accent" role="img" aria-label={label}>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={Math.max(0, Math.min(1, frac)) * W} height={H} />
            </clipPath>
          </defs>
          <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={paceAreaPath(curve, W, H)} fill="currentColor" fillOpacity={0.14} />
          <path d={paceAreaPath(curve, W, H)} fill="currentColor" fillOpacity={0.32} clipPath={`url(#${clipId})`} />
          <path d={paceLinePath(curve, W, H)} fill="none" stroke="currentColor" strokeOpacity={0.85} strokeWidth={1.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {curve.pauses.map((p) => (
            <rect
              key={p.startFrac}
              x={p.startFrac * W}
              y={H - 3}
              width={Math.max(0.6, (p.endFrac - p.startFrac) * W)}
              height={3}
              className="fill-foreground"
              fillOpacity={0.4}
            />
          ))}
          {ticks.map((t) => (
            <line key={t} x1={t * W} y1={0} x2={t * W} y2={H} className="stroke-foreground" strokeOpacity={0.3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={frac * W} y1={0} x2={frac * W} y2={H} className="stroke-foreground" strokeOpacity={0.7} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}
