import type { CSSProperties } from "react";
import { moveCounter, moveGridLayout, moveState } from "@/lib/analysis/replayStage";

/**
 * The reconstruction as a small grid of moves in a high-contrast serif: the move playing is white (underlined
 * while it turns), the ones already played are bright and the ones still to come are dim, so the grid reads
 * as progress. A tiny tracked line above it names what this is, the phase and how far along ("013 / 132").
 * `widthPx` is the room it has; the columns and the text size follow it.
 */
export function MoveGrid({
  tokens,
  current,
  turning,
  title,
  phase,
  widthPx,
}: {
  tokens: readonly string[];
  /** Index into `tokens` of the move playing, or -1 before the first. */
  current: number;
  turning: boolean;
  title: string;
  phase: string | null;
  widthPx: number;
}) {
  const layout = moveGridLayout(tokens.length, widthPx);
  return (
    <div className="replay-grid" data-testid="replay-grid">
      <p className="replay-eyebrow">
        <span>
          {title}
          {phase && <span className="replay-eyebrow__phase">{phase}</span>}
        </span>
        <span className="tabular-nums">{moveCounter(current + 1, tokens.length)}</span>
      </p>
      <ol className="replay-grid__moves" style={{ "--cols": layout.cols, "--fs": `${layout.fontPx}px` } as CSSProperties} aria-label="Moves">
        {tokens.map((token, i) => (
          <li
            key={i}
            data-state={moveState(i, current)}
            data-turning={i === current && turning ? "true" : undefined}
            aria-current={i === current ? "step" : undefined}
            className="replay-grid__move"
          >
            {token}
          </li>
        ))}
      </ol>
    </div>
  );
}
