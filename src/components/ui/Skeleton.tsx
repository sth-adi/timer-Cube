import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import "@/styles/skeleton.css";

/** One placeholder block. Size it with the same classes the real content uses (height, width, rounding). */
export function Skeleton({ className, style, round }: { className?: string; style?: CSSProperties; round?: boolean }) {
  return <span aria-hidden="true" className={cn("sk", round && "sk-round", className)} style={style} />;
}

/**
 * Wraps a set of placeholders: announces the loading to a screen reader once (the blocks themselves are hidden),
 * and fades the whole group in after `delayMs` so content that arrives within a blink never shows a placeholder.
 * The group keeps its footprint from the first frame, only its opacity waits.
 */
export function SkeletonGroup({
  label = "Loading",
  delayMs = 120,
  className,
  children,
}: {
  label?: string;
  delayMs?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("sk-group", className)}
      style={{ "--sk-delay": `${delayMs}ms` } as CSSProperties}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
