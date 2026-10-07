import { formatLiveTps } from "@/lib/analysis/tps";
import { cn } from "@/lib/utils/cn";
import "@/styles/live-solve.css";

/**
 * The "4.2 TPS" readout on the smart-cube solving line. Always the same
 * width: the number sits in a fixed slot of tabular digits, and at rest (no
 * turning yet, or a pause long enough that the rolling rate has faded out) it
 * shows a dimmed "—" in that same slot instead of disappearing — so the
 * moves-so-far line never reflows as your hands start and stop.
 *
 * `tps` is the smoothed rate from rollingTps (lib/analysis/tps.ts), or null
 * when not recording.
 */
export function LiveTps({ tps }: { tps: number | null }) {
  const shown = formatLiveTps(tps);
  return (
    <span className={cn("live-readout inline-flex items-baseline gap-1 whitespace-nowrap transition-colors duration-300 motion-reduce:transition-none", shown === null ? "text-muted-2/60" : "text-accent")}>
      <span className="inline-block w-[4ch] text-right font-semibold">{shown ?? "—"}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider">TPS</span>
    </span>
  );
}
