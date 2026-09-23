"use client";

import { Palette } from "lucide-react";
import { CROSS_COLORS, CROSS_COLOR_NAME, type NeutralityReport, type NeutralitySolve } from "@/lib/xray/neutrality";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { cn } from "@/lib/utils/cn";

const MAX_CROSS = 8;

/** One scramble's six crosses as bars — shortest highlighted, your white one marked with what you actually used. */
export function SolveNeutrality({ solve }: { solve: NeutralitySolve }) {
  const best = Math.min(...CROSS_COLORS.map((c) => solve.lengths[c]));
  const sorted = [...CROSS_COLORS].sort((a, b) => solve.lengths[a] - solve.lengths[b]);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Palette size={13} className="text-accent" /> Cross on every color
      </p>
      <div className="flex flex-col gap-1">
        {sorted.map((c) => {
          const len = solve.lengths[c];
          return (
            <div key={c} className="flex items-center gap-2">
              <span className="w-12 text-[10px] text-muted">{CROSS_COLOR_NAME[c]}</span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg-panel-2">
                <div
                  className="h-full rounded"
                  style={{ width: `${Math.max(4, (len / MAX_CROSS) * 100)}%`, background: FACELET_COLORS[c], opacity: len === best ? 1 : 0.55 }}
                />
                {c === "U" && (
                  <div
                    className="absolute top-0 h-full border-r-2 border-dashed border-foreground"
                    style={{ left: `${Math.min(100, (solve.yourMoves / MAX_CROSS) * 100)}%` }}
                    title={`You used ${solve.yourMoves} turns`}
                  />
                )}
              </div>
              <span className={cn("w-10 text-right text-[11px] tabular-nums", len === best ? "font-bold text-foreground" : "text-muted")}>
                {len} {len === 1 ? "turn" : "turns"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        You solved white in <span className="font-semibold text-foreground">{solve.yourMoves}</span> turns (optimal {solve.lengths.U}).
        {best < solve.lengths.U
          ? ` ${sorted.filter((c) => solve.lengths[c] === best).map((c) => CROSS_COLOR_NAME[c]).join(" / ")} had a ${best}-turn cross.`
          : " White was already the shortest cross on this scramble."}
      </p>
    </div>
  );
}

/** History: how much each level of color neutrality would really save you, on your own scrambles at your own cross speed. */
export function NeutralityHistory({ report }: { report: NeutralityReport }) {
  const dual = report.options.find((o) => o.colors.length === 2 && o.colors.includes("D"))!;
  const full = report.options.find((o) => o.colors.length === 6)!;
  const second = report.bestSecondColor;
  // The best single extra color is only worth its own row when it isn't yellow (that's already the dual row).
  const rows = [dual, full, ...(second && !second.colors.includes("D") ? [second] : [])];
  const maxSave = Math.max(1, ...rows.map((r) => r.msSaved));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-bg-panel-2 px-2 py-2">
          <p className="text-base font-bold tabular-nums text-foreground">{report.avgYourMoves.toFixed(1)}</p>
          <p className="text-[10px] text-muted-2">your cross turns</p>
        </div>
        <div className="rounded-lg bg-bg-panel-2 px-2 py-2">
          <p className="text-base font-bold tabular-nums text-foreground">{report.avgWhiteOptimal.toFixed(1)}</p>
          <p className="text-[10px] text-muted-2">white optimal</p>
        </div>
        <div className="rounded-lg bg-bg-panel-2 px-2 py-2">
          <p className="text-base font-bold tabular-nums text-foreground">{Math.round(report.msPerTurn)}ms</p>
          <p className="text-[10px] text-muted-2">per cross turn</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((o) => (
          <div key={o.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="flex gap-0.5">
                  {o.colors.map((c) => (
                    <span key={c} className="h-2.5 w-2.5 rounded-[2px] ring-1 ring-black/30" style={{ background: FACELET_COLORS[c] }} />
                  ))}
                </span>
                {o.label}
              </span>
              <span className="tabular-nums text-muted">
                −{(o.msSaved / 1000).toFixed(2)}s/solve · helps {Math.round(o.helpedRate * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-panel-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(o.msSaved / maxSave) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-2">
        {report.solves} scrambles. Savings assume you&apos;d solve other colors&apos; crosses as efficiently ({report.efficiency.toFixed(2)}×
        optimal) and as fast as your white ones.
      </p>
    </div>
  );
}
