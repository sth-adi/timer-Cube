"use client";

import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { turnArrow } from "@/components/smartcube/RouteChips";
import { cn } from "@/lib/utils/cn";

/** One physical turn as a small chip: the turning center's color with a direction arrow. `bad` rings it red. */
export function TurnChip({ token, bad }: { token: string; bad?: boolean }) {
  const light = token[0] === "U" || token[0] === "D";
  return (
    <span
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-xs font-black ring-1 ring-black/25",
        light ? "text-black/80" : "text-white",
        bad && "ring-2 ring-danger ring-offset-1 ring-offset-bg-panel",
      )}
      style={{ background: FACELET_COLORS[token[0]] }}
    >
      {turnArrow(token)}
    </span>
  );
}

/** A row of turn chips. */
export function TurnChips({ moves, badIndex }: { moves: readonly string[]; badIndex?: number | null }) {
  return (
    <div className="flex flex-wrap gap-1">
      {moves.map((t, i) => (
        <TurnChip key={i} token={t} bad={i === badIndex} />
      ))}
    </div>
  );
}
