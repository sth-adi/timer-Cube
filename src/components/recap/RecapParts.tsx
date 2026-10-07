"use client";

import "@/styles/recap.css";
import { cn } from "@/lib/utils/cn";

/** Seconds with two decimals, no sign: 1230 -> "1.23". */
export const secs2 = (ms: number) => (Math.abs(ms) / 1000).toFixed(2);

/** The one surface every recap card sits on (radius, padding and tabular numerals live in recap.css). */
export function RecapCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rc-card", className)} {...rest}>
      {children}
    </div>
  );
}

/** The small caps heading every recap card opens with: a quiet icon, then the name. */
export function CardTitle({ icon, children, className, as: Tag = "p" }: { icon?: React.ReactNode; children: React.ReactNode; className?: string; as?: "p" | "h2" | "h3" }) {
  return (
    <Tag className={cn("rc-card-title", className)}>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </Tag>
  );
}

export type DeltaDir = "fast" | "slow" | "flat";

/**
 * A change against your usual, readable without colour: a down-pointing triangle and a minus
 * sign for faster, an up-pointing triangle and a plus sign for slower. The screen-reader text
 * says it in words.
 */
export function Delta({ ms, dir, className, unit = "usual" }: { ms: number; dir?: DeltaDir; className?: string; unit?: string }) {
  const d: DeltaDir = dir ?? (ms < 0 ? "fast" : ms > 0 ? "slow" : "flat");
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : "";
  return (
    <span className={cn("rc-delta", className)} data-dir={d}>
      <svg viewBox="0 0 8 8" aria-hidden="true" focusable="false">
        {ms < 0 ? <path d="M0 1h8L4 7z" fill="currentColor" /> : ms > 0 ? <path d="M0 7h8L4 1z" fill="currentColor" /> : <rect x="0" y="3" width="8" height="2" rx="1" fill="currentColor" />}
      </svg>
      <span aria-hidden="true">
        {sign}
        {secs2(ms)}
      </span>
      <span className="sr-only">
        {secs2(ms)} seconds {ms < 0 ? "faster than" : ms > 0 ? "slower than" : "the same as"} {unit}
      </span>
    </span>
  );
}

/**
 * A section that opens and closes by animating its height (grid rows 0fr to 1fr) and fading. The
 * content stays mounted so there is no jump, but it is `inert` and hidden while closed, so it can't be
 * focused or read. Motion is switched off for reduced-motion and for the flat fx level (recap.css).
 */
export function Collapse({ open, id, children, className }: { open: boolean; id?: string; children: React.ReactNode; className?: string }) {
  return (
    <div id={id} className={cn("rc-collapse", className)} data-open={open} inert={!open}>
      <div className="rc-collapse-inner">{children}</div>
    </div>
  );
}
