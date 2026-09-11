"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import type { Solve } from "@/types";
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
        <span className="ml-auto rounded-full bg-bg-panel-2 px-2 py-0.5 text-[10px] font-medium text-muted-2">
          {resolved.length}
        </span>
      </h3>
      <div className="space-y-4">
        {grouped.map(([category, categoryTiles]) => (
          <div key={category}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-2">{category}</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {categoryTiles.map((tile) => (
                <div key={tile.id} className="rounded-lg bg-bg-panel-2 px-2.5 py-2">
                  <p className="truncate text-[10px] text-muted-2">{tile.label}</p>
                  <p className="tabular-nums text-sm font-semibold text-foreground">{tile.result.value}</p>
                  {tile.result.sub && <p className="truncate text-[10px] text-muted-2">{tile.result.sub}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
