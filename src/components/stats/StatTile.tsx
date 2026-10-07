"use client";

import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/Skeleton";

/** Every tile is the same height whatever it holds (or while it loads), so a row of them never jumps. */
const TILE = "group flex min-h-[4rem] flex-col justify-center gap-0.5 rounded-lg bg-bg-panel-2/60 px-2.5 py-2 text-left";

/**
 * A figure tile: the number first and biggest, its label beneath, then an optional note or delta
 * (a delta carries its own sign/arrow in `sub`, so direction is never colour alone).
 * With `onClick` it is a button; with `loading` it holds its footprint as a skeleton.
 */
export function StatTile({
  label,
  value,
  sub,
  onClick,
  title,
  loading,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
  title?: string;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn(TILE, className)} aria-hidden>
        <Skeleton className="h-[18px] w-14" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }
  const body = (
    <>
      <span className="tabular-timer break-words text-[17px] font-semibold leading-tight text-foreground group-hover:text-accent">{value}</span>
      <span className="flex items-center gap-0.5 text-[11px] leading-snug text-muted-2 first-letter:uppercase group-hover:text-accent">
        <span className="truncate">{label}</span>
        {onClick && <ArrowUpRight size={10} className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />}
      </span>
      {sub && <span className="text-[11px] leading-snug text-muted-2">{sub}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={cn(TILE, "transition-colors hover:bg-bg-panel-2", className)}>
        {body}
      </button>
    );
  }
  return (
    <div className={cn(TILE, className)} title={title}>
      {body}
    </div>
  );
}
