"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  BluetoothConnected,
  FlaskConical,
  Shuffle,
  Volume2,
  VolumeX,
} from "lucide-react";
import { VOICE_MODES, type VoiceMode } from "@/lib/smartcube/voiceCoach";
import { cn } from "@/lib/utils/cn";

/**
 * A tappable battery readout for the connected cube — most Bluetooth cubes
 * (GAN, MoYu's AI models, QiYi) report this, but nothing in this app asked
 * for it before now. Tapping it re-requests a fresh reading rather than
 * waiting for the cube to push one on its own schedule (some protocols
 * don't push updates at all outside of an explicit request).
 */
export function BatteryBadge({ level, onRefresh }: { level: number | null; onRefresh: () => void }) {
  if (level === null) {
    return (
      <button type="button" onClick={onRefresh} className="flex items-center gap-1 text-muted-2 hover:text-muted" aria-label="Battery level unknown, tap to refresh">
        <BatteryWarning size={13} />
        <span className="text-[11px]">…</span>
      </button>
    );
  }
  const Icon = level > 66 ? BatteryFull : level > 33 ? BatteryMedium : level > 12 ? BatteryLow : BatteryWarning;
  const colorClass = level > 33 ? "text-muted" : level > 12 ? "text-warning" : "text-danger";
  return (
    <button
      type="button"
      onClick={onRefresh}
      title="Tap to refresh"
      aria-label={`Battery ${level}%, tap to refresh`}
      className={cn("flex items-center gap-1 tabular-nums", colorClass)}
    >
      <Icon size={13} />
      <span className="text-[11px] font-medium">{level}%</span>
    </button>
  );
}

export interface SolveHeaderProps {
  /** The name shown for the cube (its nickname, else the device name). */
  name: string | null;
  /** Hover text with the protocol, hardware and MAC. */
  nameTitle?: string;
  batterySupported: boolean;
  batteryLevel: number | null;
  onRefreshBattery: () => void;
  /** Whether the cube reports its own state, and whether that has been read yet. */
  reportsState: boolean;
  stateSource: string | null;
  /** A solve is in flight (armed or recording): the header shrinks to one line and Disconnect asks first. */
  inFlight: boolean;
  /** Armed or recording hides Freestyle; it's only an option between solves. */
  freestyle: boolean;
  onToggleFreestyle: () => void;
  voiceCoach: VoiceMode;
  onCycleVoice: () => void;
  /** Called once a disconnect is confirmed (or straight away between solves). `inFlight` says whether it drops a solve. */
  onDisconnect: (inFlight: boolean) => void;
  /** The small status dot (recording only); it positions itself against this header. */
  statusDot?: ReactNode;
}

/**
 * The line of cube controls above the time. Between solves it is the full set (name, battery,
 * state, Lab, Voice, Freestyle, Disconnect). Once a solve is armed it collapses to one line —
 * name, battery, status dot, Disconnect — so it can't wrap into the space above the digits and
 * nothing in it can navigate away with the clock running. Disconnect then asks first, in place of
 * the line itself (no popup over the digits, no height change), with 40px touch targets.
 */
export function SolveHeader({
  name,
  nameTitle,
  batterySupported,
  batteryLevel,
  onRefreshBattery,
  reportsState,
  stateSource,
  inFlight,
  freestyle,
  onToggleFreestyle,
  voiceCoach,
  onCycleVoice,
  onDisconnect,
  statusDot,
}: SolveHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  // The question belongs to the solve it was asked in: it doesn't come back for the next one.
  if (confirming && !inFlight) setConfirming(false);

  useEffect(() => {
    if (!confirming) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  if (inFlight) {
    return (
      <div className="relative flex min-h-4 max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-success [&>*]:whitespace-nowrap" data-testid="solve-header" data-compact>
        {confirming ? (
          <div role="group" aria-label="Confirm disconnect" className="flex flex-wrap items-center justify-center gap-x-2" data-testid="disconnect-confirm">
            <span className="text-[11px] font-medium text-foreground">Drop this solve?</span>
            <button
              type="button"
              autoFocus
              onClick={() => setConfirming(false)}
              className="-my-3 flex h-10 items-center rounded-full bg-accent px-3.5 text-[11px] font-semibold text-accent-fg"
              data-testid="disconnect-keep"
            >
              Keep solving
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onDisconnect(true);
              }}
              className="-my-3 flex h-10 items-center rounded-full bg-danger/15 px-3.5 text-[11px] font-semibold text-danger"
              title="Disconnect the cube. This solve is dropped, nothing is saved."
              data-testid="disconnect-confirm-yes"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <>
            <BluetoothConnected size={14} />
            <span className="max-w-[9rem] truncate" title={nameTitle}>
              {name}
            </span>
            {batterySupported && <BatteryBadge level={batteryLevel} onRefresh={onRefreshBattery} />}
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="-my-3 flex h-10 items-center px-2 text-[11px] text-muted underline hover:text-foreground"
              aria-label="Disconnect the cube (asks first, this drops the solve)"
              data-testid="disconnect"
            >
              Disconnect
            </button>
            {statusDot}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-success [&>*]:whitespace-nowrap" data-testid="solve-header">
      <BluetoothConnected size={14} />
      <span title={nameTitle}>{name}</span>
      {batterySupported && (
        <>
          <span className="text-border">·</span>
          <BatteryBadge level={batteryLevel} onRefresh={onRefreshBattery} />
        </>
      )}
      <span className="text-[10px] text-muted" title={reportsState ? "The cube reports its own state; the app checks against it whenever you pause" : "This cube can't report its state, so the app assumed it was solved when you connected"}>
        {reportsState ? (stateSource === "cube" ? "· state read from cube" : "· reading state…") : "· assumed solved at connect"}
      </span>
      <Link href="/lab" className="flex items-center gap-1 text-accent hover:underline">
        <FlaskConical size={12} /> Lab
      </Link>
      <button
        type="button"
        onClick={onCycleVoice}
        className={cn("flex items-center gap-1 hover:underline", voiceCoach === "off" ? "text-muted-2" : "text-accent")}
        title="Voice coach: calls your splits and time out loud. Tap to cycle Off / Splits / Full."
      >
        {voiceCoach === "off" ? <VolumeX size={12} /> : <Volume2 size={12} />} Voice: {VOICE_MODES.find((m) => m.id === voiceCoach)?.name}
      </button>
      <button
        type="button"
        onClick={onToggleFreestyle}
        aria-pressed={freestyle}
        className={cn("flex items-center gap-1 hover:underline", freestyle ? "text-accent" : "text-muted-2")}
        title="Freestyle: scramble the cube any way you like, its state becomes the scramble, instead of following a generated one."
      >
        <Shuffle size={12} /> Freestyle{freestyle ? ": on" : ""}
      </button>
      <button type="button" onClick={() => onDisconnect(false)} className="text-muted-2 underline hover:text-muted" data-testid="disconnect">
        Disconnect
      </button>
      {statusDot}
    </div>
  );
}
