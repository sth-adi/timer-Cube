"use client";

import { useState } from "react";
import { ArrowLeftRight, ChevronDown, Plus } from "lucide-react";
import { useSessionStore } from "@/lib/store/sessionStore";
import { cn } from "@/lib/utils/cn";
import { SessionCompareSheet } from "./SessionCompareSheet";

export function SessionSwitcher() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const switchSession = useSessionStore((s) => s.switchSession);
  const addSession = useSessionStore((s) => s.addSession);
  const [open, setOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const active = sessions.find((s) => s.id === activeId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/90 hover:bg-bg-panel-2 transition-colors"
      >
        {active?.name ?? "Session"}
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
                "w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-bg-panel-2 transition-colors",
                s.id === activeId ? "text-accent" : "text-foreground/90",
              )}
            >
              {s.name}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              const name = `Session ${sessions.length + 1}`;
              addSession(name);
              setOpen(false);
            }}
            className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:text-foreground hover:bg-bg-panel-2 transition-colors"
          >
            <Plus size={14} /> New session
          </button>
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
