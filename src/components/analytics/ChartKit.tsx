"use client";

import { useCallback, useRef, useState } from "react";
import { PHASES, type PhaseName } from "@/lib/analytics/solveMetrics";

/** Phase identity colors (fixed order, validated palette — see --viz-* in globals.css). */
export const PHASE_COLOR: Record<PhaseName, string> = {
  Cross: "var(--viz-1)",
  F2L: "var(--viz-2)",
  OLL: "var(--viz-3)",
  PLL: "var(--viz-4)",
};

export function PhaseLegend({ values }: { values?: Partial<Record<PhaseName, string>> }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {PHASES.map((p) => (
        <span key={p} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PHASE_COLOR[p] }} />
          {p}
          {values?.[p] && <span className="font-semibold text-foreground">{values[p]}</span>}
        </span>
      ))}
    </div>
  );
}

export interface TipContent {
  /** The number — shown strong. */
  value: string;
  /** What it is — shown secondary. */
  label: string;
  detail?: string;
}

interface TipState extends TipContent {
  x: number;
  y: number;
}

/**
 * Hover/focus tooltips for a chart: `bind(content)` spreads onto any mark
 * (SVG or HTML) and makes it focusable; render <ChartTip tip={tip} /> inside
 * the same `ref`'d, position:relative container. Tooltips only enhance —
 * every value is also printed somewhere on the page.
 */
export function useChartTip() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const place = useCallback((clientX: number, clientY: number, content: TipContent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ ...content, x: clientX - box.left, y: clientY - box.top });
  }, []);
  const bind = useCallback(
    (content: TipContent) => ({
      tabIndex: 0,
      onPointerMove: (e: React.PointerEvent) => place(e.clientX, e.clientY, content),
      onPointerLeave: () => setTip(null),
      onFocus: (e: React.FocusEvent<Element>) => {
        const r = e.currentTarget.getBoundingClientRect();
        place(r.left + r.width / 2, r.top, content);
      },
      onBlur: () => setTip(null),
    }),
    [place],
  );
  return { ref, tip, bind, setTip, place };
}

export function ChartTip({ tip, width }: { tip: TipState | null; width?: number }) {
  if (!tip) return null;
  const w = width ?? 9999;
  return (
    <div
      className="pointer-events-none absolute z-10 flex -translate-y-full flex-col rounded-lg border border-border-strong bg-bg-elevated px-2.5 py-1.5 shadow-lg"
      style={{ left: Math.min(Math.max(8, tip.x - 60), w - 140), top: tip.y - 8, minWidth: 110 }}
    >
      <span className="text-sm font-bold text-foreground">{tip.value}</span>
      <span className="text-[10px] text-muted">{tip.label}</span>
      {tip.detail && <span className="text-[10px] text-muted-2">{tip.detail}</span>}
    </div>
  );
}

/** The single headline number a page leads with. */
export function Hero({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 rounded-xl p-5 text-center">
      <p className="text-5xl font-bold text-foreground">{value}</p>
      <p className="text-xs font-medium text-muted">{label}</p>
      {sub && <p className="max-w-sm text-[11px] text-muted-2">{sub}</p>}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">{children}</p>;
}
