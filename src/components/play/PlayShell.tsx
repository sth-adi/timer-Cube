"use client";

import Link from "next/link";
import { ChevronLeft, Keyboard } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { KEY_TURNS } from "@/lib/play/usePlayInput";
import { cn } from "@/lib/utils/cn";

/** Sticker colors by center (engine frame: white U, green F). */
export const FACE_HEX: Record<string, string> = {
  U: "#f4f4f6",
  R: "#ff3b4a",
  F: "#22d67a",
  D: "#ffd400",
  L: "#ff8a1e",
  B: "#2f7bff",
};

export function PlayShell({
  accent,
  title,
  tagline,
  back = "/play",
  wide = false,
  children,
}: {
  accent: string;
  title: string;
  tagline: string;
  back?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="play-root" style={{ ["--play-accent" as string]: accent }}>
      <AppBootstrap />
      <div className={cn("relative mx-auto flex w-full flex-col gap-4 px-4 pb-16 pt-4", wide ? "max-w-3xl" : "max-w-md")}>
        <div className="flex items-center justify-between">
          <Link href={back} className="flex items-center gap-0.5 text-xs font-semibold text-[var(--play-dim)] hover:text-white">
            <ChevronLeft size={16} /> {back === "/" ? "Timer" : "Play"}
          </Link>
          <CubeStatus />
        </div>
        <header className="flex flex-col gap-1.5">
          <h1 className="play-title text-[44px]">{title}</h1>
          <p className="max-w-sm text-[13px] leading-snug text-[var(--play-dim)]">{tagline}</p>
        </header>
        {children}
      </div>
    </div>
  );
}

export function CubeStatus() {
  const connected = useSmartCubeStore((s) => s.connected);
  const connecting = useSmartCubeStore((s) => s.connecting);
  const supported = useSmartCubeStore((s) => s.supported);
  const deviceName = useSmartCubeStore((s) => s.deviceName);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);
  const connect = useSmartCubeStore((s) => s.connect);
  if (connected)
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 play-pulse" />
        {deviceName ?? "Cube"}
        {gyroActive && <span className="text-emerald-300/60">· gyro</span>}
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => void connect()}
      disabled={connecting || !supported}
      className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-[var(--play-dim)] hover:text-white disabled:hover:text-[var(--play-dim)]"
      title={supported ? "Connect a smart cube" : "No Web Bluetooth here — play with the keys and pad"}
    >
      <Keyboard size={12} />
      {connecting ? "Connecting…" : supported ? "Keys & pad · connect cube" : "Keys & pad"}
    </button>
  );
}

const PAD = ["R", "R'", "L", "L'", "U", "U'", "D", "D'", "F", "F'", "B", "B'"];
const KEY_FOR = Object.fromEntries(Object.entries(KEY_TURNS).map(([k, t]) => [t, k.toUpperCase()]));
/** Which color each grip face is in the home grip (yellow top, green front). */
const HOME_COLOR: Record<string, string> = { U: "D", D: "U", R: "L", L: "R", F: "F", B: "B" };

/**
 * On-screen turns in grip notation, for playing without a cube. Each key
 * is tinted with the face it turns in the home grip and shows its
 * keyboard shortcut (csTimer's virtual-cube keys).
 */
export function TurnPad({ onTurn, labels, className }: { onTurn: (grip: string) => void; labels?: Partial<Record<string, string>>; className?: string }) {
  return (
    <div className={cn("grid grid-cols-6 gap-1.5", className)}>
      {PAD.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onTurn(t)}
          className="flex h-12 flex-col items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-sm font-bold active:scale-95"
          style={{ boxShadow: `inset 0 -3px 0 ${FACE_HEX[HOME_COLOR[t[0]]]}` }}
        >
          {labels?.[t] ?? t}
          <span className="text-[9px] font-medium text-[var(--play-dim)]">{KEY_FOR[t]}</span>
        </button>
      ))}
    </div>
  );
}
