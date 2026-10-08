"use client";

import { useMemo } from "react";
import type { Solve } from "@/types";
import { StatTile } from "./StatTile";
import { STAT_TILES, type StatTileResult } from "@/lib/stats/statTiles";

interface ResolvedTile {
  id: string;
  category: string;
  label: string;
  result: StatTileResult;
}

/**
 * Every stat in the registry (see statTiles.ts) that has enough data to
 * compute right now, grouped by category. A tile with insufficient data
 * just doesn't appear — no placeholders, no "not enough data yet" noise for
 * 100 different things at once.
 */
export function StatTilesGrid({ solves, rawSolves }: { solves: Solve[]; rawSolves: Solve[] }) {
  const resolved = useMemo<ResolvedTile[]>(() => {
    const out: ResolvedTile[] = [];
    for (const def of STAT_TILES) {
      const result = def.compute(solves, rawSolves);
      if (result) out.push({ id: def.id, category: def.category, label: def.label, result });
    }
    return out;
  }, [solves, rawSolves]);

  const grouped = useMemo(() => {
    const map = new Map<string, ResolvedTile[]>();
    for (const tile of resolved) {
      if (!map.has(tile.category)) map.set(tile.category, []);
      map.get(tile.category)!.push(tile);
    }
    return [...map.entries()];
  }, [resolved]);

  if (resolved.length === 0) return null;

  return (
    <div>
      <h3 className="mb-4 flex items-baseline justify-between text-sm font-semibold tracking-[-0.01em]">
        Every stat we track
        <span className="tabular-timer text-xs font-normal text-muted-2">{resolved.length}</span>
      </h3>
      <div className="space-y-5">
        {grouped.map(([category, categoryTiles]) => (
          <div key={category}>
            <p className="mb-1 border-b border-border pb-1.5 text-xs font-medium text-muted-2">{category}</p>
            {/* Columns by the card's own width, not the screen's: in the desktop sidebar this card is narrow. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-3">
              {categoryTiles.map((tile) => (
                <StatTile key={tile.id} label={tile.label} value={tile.result.value} sub={tile.result.sub} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
