"use client";

import { useMemo } from "react";
import { Cube3D } from "@/components/cube3d/Cube3D";
import { BODY_COLORS, BODY_LABELS, EMBLEMS, EMBLEM_LABELS, SCHEMES, SCHEME_FACES, SCHEME_FACE_LABELS, SCHEME_LABELS, STICKER_STYLES, STICKER_STYLE_LABELS, WEAR_LABELS, WEAR_LEVELS } from "@/lib/cube3d/look";
import { applyMove } from "@/lib/cube-engine/stickerTurns";
import { SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { cn } from "@/lib/utils/cn";

const PREVIEW_MOVES = ["R", "U", "R'", "F", "D2", "L", "B'", "U'"];

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; name: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-[11px] text-muted-2">{label}</p>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={cn(
              "min-h-9 flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium leading-tight transition-colors",
              value === o.id ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
            )}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The cube's sticker style, body, wear, colour scheme, centre emblem and colour-blind symbols, with a small scrambled cube that shows the choice as it is made. */
export function CubeLookSettings() {
  const look = useSettingsStore((s) => s.cubeLook);
  const setCubeLook = useSettingsStore((s) => s.setCubeLook);
  const preview = useMemo(() => PREVIEW_MOVES.reduce(applyMove, SOLVED_FACELETS), []);
  return (
    <div className="mt-3" data-testid="cube-look-settings">
      <p className="mb-2 text-[11px] text-muted-2">Cube look</p>
      <div className="flex items-start gap-3">
        <Cube3D facelets={preview} size={96} look={look} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Segmented
            label="Stickers"
            value={look.stickerStyle}
            options={STICKER_STYLES.map((id) => ({ id, name: STICKER_STYLE_LABELS[id] }))}
            onChange={(stickerStyle) => setCubeLook({ ...look, stickerStyle })}
          />
          <Segmented label="Body" value={look.body} options={BODY_COLORS.map((id) => ({ id, name: BODY_LABELS[id] }))} onChange={(body) => setCubeLook({ ...look, body })} />
          <Segmented label="Wear" value={look.wear} options={WEAR_LEVELS.map((id) => ({ id, name: WEAR_LABELS[id] }))} onChange={(wear) => setCubeLook({ ...look, wear })} />
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-2.5">
        <Segmented label="Colour scheme" value={look.scheme} options={SCHEMES.map((id) => ({ id, name: SCHEME_LABELS[id] }))} onChange={(scheme) => setCubeLook({ ...look, scheme })} />
        {look.scheme === "custom" && (
          <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Custom colours">
            {SCHEME_FACES.map((face, i) => (
              <label key={face} className="flex flex-col items-center gap-1 text-[10px] text-muted-2">
                <input
                  type="color"
                  value={look.customColors[i]}
                  onChange={(e) => setCubeLook({ ...look, customColors: look.customColors.map((c, k) => (k === i ? e.target.value : c)) })}
                  aria-label={`${SCHEME_FACE_LABELS[face]} colour`}
                  className="h-8 w-full cursor-pointer rounded border border-border bg-transparent p-0.5"
                />
                {SCHEME_FACE_LABELS[face]}
              </label>
            ))}
          </div>
        )}
        <Segmented label="Centre emblem" value={look.emblem} options={EMBLEMS.map((id) => ({ id, name: EMBLEM_LABELS[id] }))} onChange={(emblem) => setCubeLook({ ...look, emblem })} />
        <label className="flex min-h-9 items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={look.symbols} onChange={(e) => setCubeLook({ ...look, symbols: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          Colour-blind symbols on the stickers
        </label>
      </div>
    </div>
  );
}
