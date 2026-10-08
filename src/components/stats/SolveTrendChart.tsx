"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Solve } from "@/types";
import { comparableTime, rollingAverages } from "@/lib/stats/stats";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { clampReadout, formatAxisTime, nearestIndex, niceTicks } from "./chartMath";
import { useElementWidth } from "./chartKit";
import "@/styles/stats-charts.css";

const HEIGHT = 196;
const PAD_L = 34;
const PAD_R = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const READOUT_W = 236;
const READOUT_H = 40;
const WINDOWS = [30, 100, 0] as const;

interface Point {
  /** Index within the visible window. */
  i: number;
  /** Solve number across the whole list (1-based) — what the readout names. */
  n: number;
  ms: number;
  /** A new best single when it happened. */
  pb: boolean;
}

/** The little key beside a legend / readout label: it repeats the mark's own shape, so identity never rests on colour alone. */
function Key({ kind }: { kind: "solve" | "ao5" | "ao12" | "best" }) {
  return (
    <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden className="shrink-0">
      {kind === "solve" && <circle cx={8} cy={5} r={3} fill="var(--muted-2)" />}
      {kind === "ao5" && <line x1={1} x2={15} y1={5} y2={5} stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />}
      {kind === "ao12" && <line x1={1} x2={15} y1={5} y2={5} stroke="var(--sc-ao12)" strokeWidth={2} strokeDasharray="3.5 2.5" />}
      {kind === "best" && <path d="M8 0.5 L12.5 5 L8 9.5 L3.5 5 Z" fill="var(--warning)" />}
    </svg>
  );
}

function diamond(cx: number, cy: number, r: number): string {
  return `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`;
}

export function SolveTrendChart({ solves }: { solves: Solve[] }) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const keyboardRef = useRef(false);
  const [setWrap, width] = useElementWidth(336);
  const [windowSize, setWindowSize] = useState<(typeof WINDOWS)[number]>(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  const { raw, dnfAt, ao5, ao12, domain, count, bestMs, firstN } = useMemo(() => {
    const times = solves.map(comparableTime);
    const roll5 = rollingAverages(solves, 5);
    const roll12 = rollingAverages(solves, 12);
    // PB flags are decided against everything before, not just the visible window.
    let best = Infinity;
    const pbFlags = times.map((t) => {
      const pb = Number.isFinite(t) && t < best;
      if (pb) best = t;
      return pb;
    });
    const total = solves.length;
    const start = windowSize > 0 ? Math.max(0, total - windowSize) : 0;
    const rawPts: Point[] = [];
    const avg5: Point[] = [];
    const avg12: Point[] = [];
    const dnf: boolean[] = [];
    for (let k = start; k < total; k++) {
      const i = k - start;
      dnf[i] = !Number.isFinite(times[k]);
      if (Number.isFinite(times[k])) rawPts.push({ i, n: k + 1, ms: times[k], pb: pbFlags[k] });
      const a = roll5[k];
      if (a !== null && Number.isFinite(a)) avg5.push({ i, n: k + 1, ms: a, pb: false });
      const b = roll12[k];
      if (b !== null && Number.isFinite(b)) avg12.push({ i, n: k + 1, ms: b, pb: false });
    }
    const all = [...rawPts, ...avg5, ...avg12].map((p) => p.ms);
    const lo = all.length ? Math.min(...all) : 0;
    const hi = all.length ? Math.max(...all) : 1;
    const span = hi - lo || 1;
    return {
      raw: rawPts,
      dnfAt: dnf,
      ao5: avg5,
      ao12: avg12,
      domain: { min: Math.max(0, lo - span * 0.06), max: hi + span * 0.06 },
      count: total - start,
      bestMs: best === Infinity ? null : best,
      firstN: start + 1,
    };
  }, [solves, windowSize]);

  // Tapping or pressing anywhere outside the chart puts a touch selection away again.
  const selected = hoverIndex !== null;
  useEffect(() => {
    if (!selected) return;
    const away = (e: PointerEvent) => {
      if (!svgRef.current?.contains(e.target as Node)) setHoverIndex(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [selected]);

  const w = Math.max(240, width);
  const plotW = w - PAD_L - PAD_R;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => PAD_L + (i / Math.max(1, count - 1)) * plotW;
  const y = (ms: number) => PAD_TOP + (1 - (ms - domain.min) / (domain.max - domain.min)) * plotH;
  const baseY = HEIGHT - PAD_BOTTOM;

  const rawByI = useMemo(() => new Map(raw.map((p) => [p.i, p])), [raw]);
  const ao5ByI = useMemo(() => new Map(ao5.map((p) => [p.i, p])), [ao5]);
  const ao12ByI = useMemo(() => new Map(ao12.map((p) => [p.i, p])), [ao12]);

  if (solves.length < 2) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-2">Solve a few more to see your trend</div>;
  }

  const line = (pts: Point[]) => pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.ms).toFixed(1)}`).join(" ");
  // A DNF average has no point, so the line breaks there rather than bridging the gap.
  const runsOf = (pts: Point[]) =>
    pts.reduce<Point[][]>((runs, p) => {
      const run = runs[runs.length - 1];
      if (run && run[run.length - 1].i === p.i - 1) run.push(p);
      else runs.push([p]);
      return runs;
    }, []);
  const ao5Runs = runsOf(ao5);
  const ao5Line = ao5Runs.map(line).join(" ");
  const ao12Line = runsOf(ao12).map(line).join(" ");
  const area = ao5Runs
    .filter((run) => run.length > 1)
    .map((run) => `${line(run)} L${x(run[run.length - 1].i).toFixed(1)},${baseY} L${x(run[0].i).toFixed(1)},${baseY} Z`)
    .join(" ");

  const { ticks, stepMs } = niceTicks(domain.min, domain.max, 4);
  const lastAo5 = ao5[ao5.length - 1];
  const showWindows = solves.length > 30;
  const dense = count > 80;

  // The best single in view, labelled where it happened.
  const bestPt = raw.reduce<Point | null>((b, p) => (b === null || p.ms < b.ms ? p : b), null);

  const hoverRaw = hoverIndex !== null ? rawByI.get(hoverIndex) : undefined;
  const hoverAo5 = hoverIndex !== null ? ao5ByI.get(hoverIndex) : undefined;
  const hoverAo12 = hoverIndex !== null ? ao12ByI.get(hoverIndex) : undefined;
  const hoverN = hoverIndex !== null ? firstN + hoverIndex : null;

  const select = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setHoverIndex(nearestIndex(clientX - rect.left - PAD_L, plotW, count));
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End", "Escape"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    keyboardRef.current = true;
    if (e.key === "Escape") return setHoverIndex(null);
    const cur = hoverIndex ?? count - 1;
    const next = e.key === "Home" ? 0 : e.key === "End" ? count - 1 : Math.min(count - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
    setHoverIndex(next);
    const r = rawByI.get(next);
    const a = ao5ByI.get(next);
    setAnnounce(`Solve ${firstN + next}: ${r ? formatTime(r.ms) : "DNF"}${a ? `, ao5 ${formatTime(a.ms)}` : ""}`);
  };

  // Best / latest direct labels share the plot: the best one steps below its marker if the latest label would sit on it.
  const latestX = lastAo5 ? x(lastAo5.i) : 0;
  const latestY = lastAo5 ? y(lastAo5.ms) : 0;
  const bestX = bestPt ? x(bestPt.i) : 0;
  const bestY = bestPt ? y(bestPt.ms) : 0;
  const clash = !!bestPt && !!lastAo5 && Math.abs(bestX - latestX) < 96 && Math.abs(bestY - latestY) < 20;
  const bestBelow = clash || bestY - 14 < PAD_TOP + 6;
  const anchorFor = (px: number): "start" | "middle" | "end" => (px < PAD_L + 36 ? "start" : px > w - PAD_R - 36 ? "end" : "middle");
  const labelHalo = { paintOrder: "stroke" as const, stroke: "var(--bg-panel)", strokeWidth: 3, strokeLinejoin: "round" as const };

  const readoutLeft = clampReadout(hoverIndex !== null ? x(hoverIndex) : 0, Math.min(READOUT_W, w), w);

  return (
    <div>
      {showWindows && (
        <div className="mb-2 flex">
          <div className="flex gap-0.5 rounded-md bg-bg-panel-2 p-0.5" role="group" aria-label="How many solves to chart">
            {WINDOWS.map((win) => (
              <button
                key={win}
                type="button"
                onClick={() => {
                  setWindowSize(win);
                  setHoverIndex(null);
                }}
                aria-pressed={windowSize === win}
                className={cn(
                  "hit-y rounded-sm px-2.5 py-0.5 text-xs font-medium transition-colors",
                  windowSize === win ? "bg-accent-soft text-accent" : "text-muted-2 hover:text-foreground",
                )}
              >
                {win === 0 ? "All" : `Last ${win}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={setWrap} className="relative">
        {/* The readout lives above the plot, never beside the finger: it names the solve under the crosshair, or says how to ask. */}
        <div className="relative" style={{ height: READOUT_H }} aria-hidden={hoverIndex === null ? undefined : true}>
          {hoverIndex !== null && hoverN !== null ? (
            <div
              className="pointer-events-none absolute top-0 flex items-stretch rounded-md border border-border-strong bg-bg-panel-2 px-2 py-1 shadow-[var(--shadow-sm)]"
              style={{ left: readoutLeft, width: Math.min(READOUT_W, w) }}
            >
              <div className="flex w-10 shrink-0 flex-col justify-center text-[11px] leading-tight text-muted-2">
                <span className="tabular-timer font-medium">#{hoverN}</span>
                {hoverRaw?.pb && <span className="text-foreground">best</span>}
              </div>
              <ReadoutCell kind="solve" label="solve" value={hoverRaw ? formatTime(hoverRaw.ms) : dnfAt[hoverIndex] ? "DNF" : "—"} />
              <ReadoutCell kind="ao5" label="ao5" value={hoverAo5 ? formatTime(hoverAo5.ms) : "—"} />
              {ao12.length > 0 && <ReadoutCell kind="ao12" label="ao12" value={hoverAo12 ? formatTime(hoverAo12.ms) : "—"} />}
            </div>
          ) : (
            <p className="flex h-full items-center text-[11px] text-muted-2">
              <span className="sc-hint-mouse">Hover the chart to read any solve</span>
              <span className="sc-hint-touch">Tap or drag across the chart to read a solve</span>
            </p>
          )}
        </div>

        <svg
          ref={svgRef}
          width={w}
          height={HEIGHT}
          viewBox={`0 0 ${w} ${HEIGHT}`}
          className="sc-focusable block touch-pan-y select-none"
          role="img"
          tabIndex={0}
          aria-label={`Solve times over ${count} solves${lastAo5 ? `, latest ao5 ${formatTime(lastAo5.ms)}` : ""}${bestMs !== null ? `, best ${formatTime(bestMs)}` : ""}. Use the arrow keys to step through solves.`}
          onPointerDown={(e) => {
            keyboardRef.current = false;
            select(e.clientX);
          }}
          onPointerMove={(e) => {
            // A mouse reads on hover; a finger only while it is down (the browser keeps vertical swipes for scrolling).
            if (e.pointerType === "mouse" || e.buttons > 0 || e.pointerType === "touch") select(e.clientX);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHoverIndex(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (keyboardRef.current) setHoverIndex(null);
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* recessive hairline grid on round second marks, and where the x axis starts and ends */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={w - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={PAD_L - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill="var(--muted-2)" className="tabular-timer">
                {formatAxisTime(t, stepMs)}
                {t < 60_000 ? "s" : ""}
              </text>
            </g>
          ))}
          <line x1={PAD_L} x2={w - PAD_R} y1={baseY} y2={baseY} stroke="var(--border-strong)" strokeWidth={1} shapeRendering="crispEdges" />
          <text x={PAD_L} y={HEIGHT - 5} fontSize={11} fill="var(--muted-2)" textAnchor="start" className="tabular-timer">
            #{firstN}
          </text>
          <text x={w - PAD_R} y={HEIGHT - 5} fontSize={11} fill="var(--muted-2)" textAnchor="end" className="tabular-timer">
            #{firstN + count - 1}
          </text>

          {area && <path d={area} fill={`url(#${gradientId})`} className="sc-fade" />}

          {/* single solves: quiet dots, no connecting line */}
          <g className="sc-fade" style={{ ["--sc-delay" as string]: "120ms" }}>
            {raw.map((p) => (
              <circle key={p.n} cx={x(p.i)} cy={y(p.ms)} r={dense ? 1.6 : count > 40 ? 2.2 : 3} fill="var(--muted-2)" fillOpacity={dense ? 0.6 : 0.8} />
            ))}
          </g>

          {/* ao12: the slow, dashed context line; ao5: the solid line that carries the story */}
          {ao12Line && (
            <path d={ao12Line} fill="none" stroke="var(--sc-ao12)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" className="sc-fade" style={{ ["--sc-delay" as string]: "200ms" }} />
          )}
          <path d={ao5Line} pathLength={1} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="sc-draw" />

          {/* earlier records are small diamonds; the best in view is the big one */}
          {raw
            .filter((p) => p.pb && p !== bestPt)
            .map((p) => (
              <path key={`pb-${p.n}`} d={diamond(x(p.i), y(p.ms), dense ? 3 : 4)} fill="var(--warning)" fillOpacity={0.75} />
            ))}
          {bestPt && <path d={diamond(bestX, bestY, 5.5)} fill="var(--warning)" stroke="var(--bg-panel)" strokeWidth={2} strokeLinejoin="round" />}

          {lastAo5 && <circle cx={latestX} cy={latestY} r={4.5} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />}

          {hoverIndex === null && (
            <g className="tabular-timer" fontSize={11} fontWeight={600} fill="var(--foreground)" style={labelHalo} pointerEvents="none">
              {bestPt && (
                <text x={bestX} y={bestBelow ? bestY + 19 : bestY - 11} textAnchor={anchorFor(bestX)}>
                  best {formatTime(bestPt.ms)}
                </text>
              )}
              {lastAo5 && (
                <text x={Math.min(latestX, w - PAD_R)} y={latestY - 11} textAnchor={anchorFor(latestX) === "start" ? "start" : "end"}>
                  ao5 {formatTime(lastAo5.ms)}
                </text>
              )}
            </g>
          )}

          {/* crosshair: a hairline at the solve, with a ringed dot on each series that has a value there */}
          {hoverIndex !== null && (
            <g pointerEvents="none">
              <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={PAD_TOP} y2={baseY} stroke="var(--muted)" strokeWidth={1} shapeRendering="crispEdges" />
              {hoverAo12 && <circle cx={x(hoverIndex)} cy={y(hoverAo12.ms)} r={4.5} fill="var(--sc-ao12)" stroke="var(--bg-panel)" strokeWidth={2} />}
              {hoverAo5 && <circle cx={x(hoverIndex)} cy={y(hoverAo5.ms)} r={4.5} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />}
              {hoverRaw && <circle cx={x(hoverIndex)} cy={y(hoverRaw.ms)} r={4.5} fill="var(--foreground)" stroke="var(--bg-panel)" strokeWidth={2} />}
            </g>
          )}
        </svg>
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted-2">
        <span className="flex items-center gap-1.5">
          <Key kind="solve" /> solve
        </span>
        <span className="flex items-center gap-1.5">
          <Key kind="ao5" /> ao5
        </span>
        {ao12.length > 0 && (
          <span className="flex items-center gap-1.5">
            <Key kind="ao12" /> ao12
          </span>
        )}
        {raw.some((p) => p.pb) && (
          <span className="flex items-center gap-1.5">
            <Key kind="best" /> new best
          </span>
        )}
      </div>
    </div>
  );
}

function ReadoutCell({ kind, label, value }: { kind: "solve" | "ao5" | "ao12"; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center pl-1.5">
      <span className="tabular-timer text-[13px] font-semibold leading-tight text-foreground">{value}</span>
      <span className="flex items-center gap-1 text-[11px] leading-tight text-muted-2">
        <Key kind={kind} />
        {label}
      </span>
    </div>
  );
}
