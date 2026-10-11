"use client";

import { useMemo } from "react";
import { Cube3D } from "@/components/cube3d/Cube3D";
import { BODY_COLORS, BODY_LABELS, STICKER_STYLES, STICKER_STYLE_LABELS } from "@/lib/cube3d/look";
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

/** The cube's sticker style and body colour, with a small scrambled cube that shows the choice as it is made. */
export function CubeLookSettings() {
  const look = useSettingsStore((s) => s.cubeLook);
  const setCubeLook = useSettingsStore((s) => s.setCubeLook);
  const preview = useMemo(() => PREVIEW_MOVES.reduce(applyMove, SOLVED_FACELETS), []);
  return (
    <div className="mt-3" data-testid="cube-look-settings">
      <p className="mb-2 text-[11px] text-muted-2">Cube look</p>
      <div className="flex items-center gap-3">
        <Cube3D facelets={preview} size={96} look={look} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Segmented
            label="Stickers"
            value={look.stickerStyle}
            options={STICKER_STYLES.map((id) => ({ id, name: STICKER_STYLE_LABELS[id] }))}
            onChange={(stickerStyle) => setCubeLook({ ...look, stickerStyle })}
          />
          <Segmented label="Body" value={look.body} options={BODY_COLORS.map((id) => ({ id, name: BODY_LABELS[id] }))} onChange={(body) => setCubeLook({ ...look, body })} />
        </div>
      </div>
    </div>
  );
}
