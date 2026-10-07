"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
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
    <div className="card rounded-xl p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <LayoutGrid size={14} className="text-accent" />
        Every stat we track
        <span className="ml-auto rounded-full bg-bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-muted-2">
          {resolved.length}
        </span>
      </h3>
      <div className="space-y-4">
        {grouped.map(([category, categoryTiles]) => (
          <div key={category}>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              <span aria-hidden className="h-px w-3 bg-accent" />
              {category}
            </p>
            {/* Columns by the card's own width, not the screen's: in the desktop sidebar this card is narrow. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
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
