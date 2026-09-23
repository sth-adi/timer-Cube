"use client";

import { Check } from "lucide-react";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { cn } from "@/lib/utils/cn";

interface RouteChipsProps {
  /** What to read (notation in the suggested grip, or color names). */
  display: readonly string[];
  /** The physical turns, for the color swatch under each chip (which center actually turns). */
  turns: readonly string[];
  /** How many are done. */
  position: number;
  /** The current turn is half-done (one quarter of a half turn). */
  partial?: boolean;
  size?: "md" | "lg";
  /**
   * "color": each chip *is* the turning center's color, with just a
   * direction arrow — for when the cube could be held any way (rewinding),
   * so notation relative to a grip would be meaningless.
   */
  variant?: "notation" | "color";
}

export function turnArrow(token: string): string {
  return token.endsWith("2") ? "2×" : token.endsWith("'") ? "↺" : "↻";
}

/**
 * A route as a row of turns: done ones ticked and dimmed, the current one
 * lit up, the rest waiting. Each carries a swatch of the center color that
 * actually turns, so the notation can be sanity-checked against the cube
 * in your hands whichever way you're holding it.
 */
export function RouteChips({ display, turns, position, partial, size = "md", variant = "notation" }: RouteChipsProps) {
  if (variant === "color") return <ColorChips turns={turns} position={position} partial={partial} />;
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {display.map((token, i) => {
        const done = i < position;
        const current = i === position;
        return (
          <span
            key={i}
            className={cn(
              "relative flex flex-col items-center gap-0.5 rounded-lg px-2 pb-1 pt-1.5 font-mono font-bold transition-all",
              size === "lg" ? "min-w-[44px] text-xl" : "min-w-[34px] text-sm",
              done && "bg-bg-panel-2 text-muted-2 opacity-60",
              current && "scale-110 bg-accent text-accent-fg shadow-lg",
              !done && !current && "bg-bg-panel-2 text-foreground",
            )}
          >
            {done ? <Check size={size === "lg" ? 18 : 14} className="my-[3px]" /> : token}
            <span className="h-1.5 w-4 rounded-full ring-1 ring-black/20" style={{ background: FACELET_COLORS[turns[i]?.[0]] ?? "transparent" }} />
            {current && partial && <span className="absolute -right-1 -top-1 rounded-full bg-warning px-1 text-[8px] text-black">½</span>}
          </span>
        );
      })}
    </div>
  );
}

const LIGHT_FACES = new Set(["U", "D"]);

function ColorChips({ turns, position, partial }: { turns: readonly string[]; position: number; partial?: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {turns.map((t, i) => {
        const done = i < position;
        const current = i === position;
        return (
          <span
            key={i}
            className={cn(
              "relative flex h-11 w-11 items-center justify-center rounded-lg text-lg font-black ring-1 ring-black/25 transition-all",
              LIGHT_FACES.has(t[0]) ? "text-black/80" : "text-white",
              done && "opacity-25",
              current && "scale-110 ring-4 ring-accent",
            )}
            style={{ background: FACELET_COLORS[t[0]] }}
          >
            {done ? <Check size={18} /> : turnArrow(t)}
            {current && partial && <span className="absolute -right-1 -top-1 rounded-full bg-warning px-1 text-[8px] text-black">½</span>}
          </span>
        );
      })}
    </div>
  );
}
