"use client";

import { useMemo, useState } from "react";
import { Box, RotateCw } from "lucide-react";
import type { Solve } from "@/types";
import { TurnCube } from "@/components/lab/TurnCube";
import { TwinStage } from "@/components/lab/TwinStage";
import { FACES_IN_ORDER, type Face } from "@/lib/cube-engine/stickerTurns";
import { computeHeatCube, hasEnoughHeat, heatView, HEAT_STEPS, stickerFills, type HeatMode } from "@/lib/stats/heatCube";
import { cn } from "@/lib/utils/cn";
import "@/styles/stats-charts.css";

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
const SIZE = 104;
/** The four resting views (yaw, pitch) the button steps through when the cube is not turning on its own: three faces each, all six between them. */
const VIEWS: { yaw: number; pitch: number }[] = [
  { yaw: -32, pitch: -24 },
  { yaw: 148, pitch: -24 },
  { yaw: -32, pitch: 24 },
  { yaw: 148, pitch: 24 },
];

const MODES: { id: HeatMode; label: string }[] = [
  { id: "often", label: "How often" },
  { id: "slow", label: "How slow" },
];

const rampVar = (step: number | null) => (step === null ? "var(--heat-0)" : `var(--heat-${step + 1})`);

/**
 * Your turns painted onto a 3D cube: each face coloured by how often you turn it, or by how slow it is to turn
 * (mid-flow, pauses left out), on one blue ramp. It turns slowly by itself so every face comes round, or holds still
 * with a button to step through four views under reduced motion. Tap a face's chip to light only that face.
 * Hidden until the saved solves carry enough turns to say anything.
 */
export function HeatCubeCard({ solves }: { solves: Solve[] }) {
  const data = useMemo(() => computeHeatCube(solves), [solves]);
  const [wanted, setWanted] = useState<HeatMode>("often");
  const [spot, setSpot] = useState<Face | null>(null);
  const [view, setView] = useState(0);

  const mode: HeatMode = wanted === "slow" && data.hasSpeed ? "slow" : "often";
  const heat = useMemo(() => heatView(data, mode), [data, mode]);
  const fills = useMemo(
    () => stickerFills((face) => (spot !== null && spot !== face ? "var(--heat-0)" : rampVar(heat.steps[face]))),
    [heat, spot],
  );

  if (!hasEnoughHeat(data)) return null;

  const byFace = new Map(data.faces.map((f) => [f.face, f]));
  const valueOf = (face: Face): string => {
    const f = byFace.get(face)!;
    if (mode === "often") return f.turns > 0 ? `${Math.round(f.share * 100)}%` : "none";
    return f.avgGapMs !== null ? `${Math.round(f.avgGapMs)}ms` : "too few";
  };
  const fmt = (v: number) => (mode === "often" ? `${Math.round(v * 100)}%` : `${Math.round(v)}ms`);
  const range = heat.range;
  const rawOf = (face: Face): number | null => (mode === "often" ? (byFace.get(face)!.turns > 0 ? byFace.get(face)!.share : null) : byFace.get(face)!.avgGapMs);
  const ranked = FACES_IN_ORDER.filter((f) => rawOf(f) !== null).sort((a, b) => rawOf(b)! - rawOf(a)!);
  const anyMissing = FACES_IN_ORDER.some((f) => heat.steps[f] === null);
  const v = VIEWS[view];

  return (
    <div className="card rounded-xl p-4" data-testid="heat-cube">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Box size={14} className="text-accent" />
          Heat cube
        </h3>
        <div className="flex gap-0.5 rounded-full bg-bg-panel-2 p-0.5" role="group" aria-label="What the colours show">
          {MODES.map((m) => {
            const off = m.id === "slow" && !data.hasSpeed;
            return (
              <button
                key={m.id}
                type="button"
                disabled={off}
                title={off ? "Needs smart-cube solves with move timing" : undefined}
                onClick={() => setWanted(m.id)}
                aria-pressed={mode === m.id}
                className={cn(
                  "hit-y rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40",
                  mode === m.id ? "bg-accent-soft text-accent" : "text-muted-2 hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mb-1 text-[11px] text-muted-2">
        {mode === "often"
          ? `Each face shaded by its share of your ${data.totalTurns.toLocaleString("en-US")} turns.`
          : "Each face shaded by its average time per turn while you are turning, pauses left out."}
      </p>

      <div className="flex flex-col items-center">
        <div aria-hidden className="-my-2">
          <TwinStage size={SIZE} box={1.7}>
            <div
              className="hc-camera relative"
              style={{ width: SIZE, height: SIZE, ["--hc-pitch" as string]: `${v.pitch}deg` }}
            >
              <div className="hc-spin relative" style={{ width: SIZE, height: SIZE, ["--hc-yaw" as string]: `${v.yaw}deg` }}>
                <TurnCube facelets={SOLVED} turning={null} size={SIZE} stickerFills={fills} />
              </div>
            </div>
          </TwinStage>
        </div>
        <button
          type="button"
          onClick={() => setView((i) => (i + 1) % VIEWS.length)}
          className="hc-view-btn hit-y mb-1 flex items-center gap-1 rounded-full bg-bg-panel-2 px-2.5 py-0.5 text-[11px] font-medium text-muted-2 hover:text-foreground"
        >
          <RotateCw size={11} /> Turn the cube
        </button>
      </div>

      {/* Legend: the ramp low to high with its end values, then the same numbers per face (the table behind the picture). */}
      {range && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-2">
          <span className="tabular-timer whitespace-nowrap">
            {mode === "often" ? "Least" : "Fastest"} {fmt(range.min)}
          </span>
          <span aria-hidden className="flex flex-1 gap-0.5">
            {Array.from({ length: HEAT_STEPS }, (_, i) => (
              <span key={i} className="h-2.5 flex-1 first:rounded-l-[3px] last:rounded-r-[3px]" style={{ background: `var(--heat-${i + 1})` }} />
            ))}
          </span>
          <span className="tabular-timer whitespace-nowrap">
            {mode === "often" ? "Most" : "Slowest"} {fmt(range.max)}
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label="Per face">
        {FACES_IN_ORDER.map((face) => {
          const on = spot === face;
          return (
            <button
              key={face}
              type="button"
              aria-pressed={on}
              onClick={() => setSpot(on ? null : face)}
              title={`${face}: ${valueOf(face)}${mode === "often" ? `, ${byFace.get(face)!.turns.toLocaleString("en-US")} turns` : ""}`}
              className={cn(
                "hit-y flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors",
                on ? "bg-accent-soft" : "bg-bg-panel-2 hover:bg-bg-panel-2/70",
              )}
            >
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: rampVar(heat.steps[face]) }} />
              <span className="font-mono font-semibold text-foreground">{face}</span>
              <span className="tabular-timer ml-auto text-muted-2">{valueOf(face)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-2">
        {ranked.length > 1 && (
          <>
            {mode === "often" ? "Most turned" : "Slowest"} <span className="font-medium text-foreground">{ranked[0]}</span>, {mode === "often" ? "least" : "fastest"}{" "}
            <span className="font-medium text-foreground">{ranked[ranked.length - 1]}</span>.{" "}
          </>
        )}
        {anyMissing && <>Grey faces have no {mode === "often" ? "turns" : "timed turns"} yet.</>}
      </p>
    </div>
  );
}
