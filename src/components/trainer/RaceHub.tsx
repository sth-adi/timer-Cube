"use client";

import { useState } from "react";
import { Swords, Users } from "lucide-react";
import { RaceMode } from "./RaceMode";
import { RoomRace } from "./RoomRace";
import { cn } from "@/lib/utils/cn";

/** The Race tab: a direct 1v1, or a room for any number of racers and spectators. */
export function RaceHub() {
  const [tab, setTab] = useState<"duel" | "room">("duel");
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3">
      <div className="grid w-full grid-cols-2 gap-1 rounded-full bg-bg-panel-2 p-1">
        {(
          [
            ["duel", "1v1", Swords],
            ["room", "Room · 2+ racers", Users],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn("flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold", tab === id ? "bg-accent text-accent-fg" : "text-muted")}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>
      {tab === "duel" ? <RaceMode /> : <RoomRace />}
    </div>
  );
}
