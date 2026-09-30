"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Warehouse } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { garageReport, type GarageCube } from "@/lib/analysis/cubeGarage";
import { cubeIdentity } from "@/lib/smartcube/cubeIdentity";
import { normalSolves } from "@/lib/stats/stats";
import { updateSolve } from "@/lib/db/solves";
import { formatTime } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-2">{label}</span>
      <span className="tabular-timer text-sm font-semibold">{value}</span>
    </div>
  );
}

function CubeRow({ cube, connected }: { cube: GarageCube; connected: boolean }) {
  const setNickname = useSettingsStore((s) => s.setCubeNickname);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cube.label);
  const commit = () => {
    setNickname(cube.id, draft === cube.name ? "" : draft);
    setEditing(false);
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-bg-panel-2 px-3 py-2.5" data-testid="garage-cube">
      <div className="flex items-center gap-1.5">
        {editing ? (
          <form
            className="flex flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <input
              autoFocus
              value={draft}
              maxLength={24}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              aria-label="Cube nickname"
              className="min-w-0 flex-1 rounded bg-bg px-1.5 py-0.5 text-sm font-semibold outline-none ring-1 ring-accent"
            />
            <button type="submit" aria-label="Save nickname" className="text-accent">
              <Check size={14} />
            </button>
          </form>
        ) : (
          <>
            <span className="truncate text-sm font-semibold text-foreground">{cube.label}</span>
            <button
              type="button"
              onClick={() => {
                setDraft(cube.label);
                setEditing(true);
              }}
              aria-label={`Rename ${cube.label}`}
              className="text-muted-2 hover:text-foreground"
            >
              <Pencil size={12} />
            </button>
          </>
        )}
        {connected && <span className="ml-auto rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">connected</span>}
      </div>
      {cube.label !== cube.name && <p className="-mt-1.5 text-[10px] text-muted-2">{cube.name}{cube.protocol ? ` · ${cube.protocol}` : ""}</p>}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Solves" value={String(cube.solves)} />
        <Stat label="Best" value={cube.best !== null ? formatTime(cube.best) : "—"} />
        <Stat label="Median" value={cube.median !== null ? formatTime(cube.median) : "—"} />
        <Stat label="Best ao12" value={cube.bestAo12 !== null ? formatTime(cube.bestAo12) : "—"} />
        <Stat label="Turns/s" value={cube.avgTps !== null ? cube.avgTps.toFixed(1) : "—"} />
        <Stat label="Lost turns" value={`${Math.round(cube.correctedRate * 100)}%`} />
        <Stat label="DNFs" value={String(cube.dnfs)} />
        <Stat label="Last used" value={new Date(cube.lastAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
      </div>
      {!cube.comparable && <p className="text-[10px] text-muted-2">Too few solves yet to compare against another cube.</p>}
    </div>
  );
}

/**
 * Your smart cubes side by side: which one you're fastest on, and which keeps
 * losing turns over Bluetooth. Only appears once at least one solve has been
 * made with a tracked cube (or there are earlier smart-cube solves to claim).
 */
export function CubeGarageCard() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const refresh = useSessionStore((s) => s.refreshFromDb);
  const nicknames = useSettingsStore((s) => s.cubeNicknames);
  const { connected, deviceMac, deviceName, protocolName } = useSmartCubeStore();
  const report = useMemo(() => garageReport(allSolves, nicknames), [allSolves, nicknames]);
  const here = useMemo(() => cubeIdentity({ deviceMac, deviceName, protocolName }), [deviceMac, deviceName, protocolName]);
  const [claiming, setClaiming] = useState(false);

  if (report.cubes.length === 0 && report.untracked === 0) return null;

  const claim = async () => {
    if (!here || claiming) return;
    setClaiming(true);
    try {
      const earlier = normalSolves(allSolves).filter((s) => !s.cube && s.moveTimestamps && s.moveTimestamps.length > 0);
      for (const s of earlier) await updateSolve(s.id, { cube: { id: here.id, name: here.name, ...(here.protocol ? { protocol: here.protocol } : {}) } });
      await refresh();
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="card flex flex-col gap-3 rounded-xl p-3" data-testid="cube-garage">
      <div className="flex items-center gap-1.5 px-1">
        <Warehouse size={14} className="text-accent" />
        <span className="text-[11px] uppercase tracking-wide text-muted-2">Cube garage</span>
      </div>
      {report.cubes.map((c) => (
        <CubeRow key={c.id} cube={c} connected={connected && here?.id === c.id} />
      ))}
      {report.notes.length > 0 && (
        <ul className="flex flex-col gap-1 px-1">
          {report.notes.map((n) => (
            <li key={n} className="text-xs leading-snug text-muted">
              {n}
            </li>
          ))}
        </ul>
      )}
      {report.untracked > 0 && (
        <div className={cn("flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted")}>
          <span>
            {report.untracked} earlier smart-cube solve{report.untracked === 1 ? "" : "s"} from before cubes were tracked.
          </span>
          {here && (
            <button
              type="button"
              onClick={() => void claim()}
              disabled={claiming}
              className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent disabled:opacity-50"
            >
              {claiming ? "Assigning…" : `They were on ${here.name}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
