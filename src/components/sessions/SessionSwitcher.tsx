"use client";

import { useState } from "react";
import { ArrowLeftRight, ChevronDown, Plus } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { WCA_EVENTS } from "@/types";
import { cn } from "@/lib/utils/cn";
import { SessionCompareSheet } from "./SessionCompareSheet";

export function SessionSwitcher() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const switchSession = useSessionStore((s) => s.switchSession);
  const addSession = useSessionStore((s) => s.addSession);
  const [open, setOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [pickingEvent, setPickingEvent] = useState(false);

  const active = sessions.find((s) => s.id === activeId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setPickingEvent(false);
        }}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/90 hover:bg-bg-panel-2 transition-colors"
      >
        {active?.name ?? "Session"}
        {active && active.event !== "333" && (
          <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
            {WCA_EVENTS.find((e) => e.id === active.event)?.label}
          </span>
        )}
        <ChevronDown size={14} className="text-muted-2" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-48 rounded-xl glass-panel p-1.5 shadow-lg">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                switchSession(s.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-bg-panel-2 transition-colors",
                s.id === activeId ? "text-accent" : "text-foreground/90",
              )}
            >
              {s.name}
              {s.event !== "333" && (
                <span className="text-[10px] font-medium text-muted-2">
                  {WCA_EVENTS.find((e) => e.id === s.event)?.label}
                </span>
              )}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          {pickingEvent ? (
            <div className="flex items-center gap-1 px-1 py-1">
              {WCA_EVENTS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    const count = sessions.filter((s) => s.event === e.id).length;
                    const name = e.id === "333" ? `Session ${count + 1}` : `${e.label} Session ${count + 1}`;
                    addSession(name, e.id);
                    setPickingEvent(false);
                    setOpen(false);
                  }}
                  className="flex-1 rounded-lg py-1.5 text-center text-xs font-medium text-muted hover:text-accent hover:bg-bg-panel-2 transition-colors"
                >
                  {e.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickingEvent(true)}
              className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
            >
              <Plus size={14} /> New session
            </button>
          )}
          {sessions.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setCompareOpen(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
            >
              <ArrowLeftRight size={14} /> Compare sessions
            </button>
          )}
        </div>
      )}
      {compareOpen && <SessionCompareSheet onClose={() => setCompareOpen(false)} />}
    </div>
  );
}
