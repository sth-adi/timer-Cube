"use client";

import { useState } from "react";
import { BatteryWarning, BluetoothConnected, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import "@/styles/recap.css";

/** A cube at or below this battery level gets the low-battery warning. */
export const LOW_BATTERY_PERCENT = 12;

/** Which cube warnings are up right now. */
export interface BannerState {
  /** The battery level while it's low, else null. */
  lowBatteryLevel: number | null;
  /** The cube came back on its own after dropping mid-solve. */
  reconnectNotice: { lostMoves: number | null } | null;
  /** Several state reports in a row came back garbled. */
  faceletsUnreliable: boolean;
}

export function anyBanner(state: BannerState): boolean {
  return state.lowBatteryLevel !== null || state.reconnectNotice !== null || state.faceletsUnreliable;
}

const UNRELIABLE_HINT =
  "Several state reports in a row came back garbled rather than just out of date, its position tracking may drift until one comes back clean. Solve it and tap 'Cube out of sync?' if a scramble or solve stops matching.";

function lowBatteryText(level: number) {
  return `Cube battery at ${level}%, a dying battery is a common cause of a mid-solve Bluetooth drop`;
}

function reconnectText(lostMoves: number | null) {
  return `Reconnected, the solve the drop interrupted${lostMoves ? ` (${lostMoves} move${lostMoves === 1 ? "" : "s"} in)` : ""} wasn't saved. Scramble again.`;
}

const UNRELIABLE_TEXT = "This cube's state reports look corrupted";

/** The full warnings, shown in flow between solves (low battery, reconnected, corrupted state reports). */
export function StatusBanners({ state, onDismissReconnect }: { state: BannerState; onDismissReconnect: () => void }) {
  return (
    <>
      {state.lowBatteryLevel !== null && (
        <p className="rc-banner flex max-w-full items-start gap-2 [&>svg]:mt-0.5 [&>svg]:shrink-0" data-tone="danger">
          <BatteryWarning size={14} aria-hidden="true" /> <span className="min-w-0">{lowBatteryText(state.lowBatteryLevel)}</span>
        </p>
      )}

      {state.reconnectNotice && (
        <p className="rc-banner flex max-w-full items-start gap-2 [&>svg]:mt-0.5 [&>svg]:shrink-0" data-tone="warning" role="status" data-testid="reconnect-notice">
          <BluetoothConnected size={14} aria-hidden="true" /> <span className="min-w-0">{reconnectText(state.reconnectNotice.lostMoves)}</span>
          <button type="button" onClick={onDismissReconnect} aria-label="Dismiss" className="hit -my-1 -mr-2 ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full hover:text-foreground">
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      )}

      {state.faceletsUnreliable && (
        <p className="rc-banner flex max-w-full items-start gap-2 [&>svg]:mt-0.5 [&>svg]:shrink-0" data-tone="warning" title={UNRELIABLE_HINT}>
          <TriangleAlert size={14} aria-hidden="true" /> <span className="min-w-0">{UNRELIABLE_TEXT}</span>
        </p>
      )}
    </>
  );
}

/**
 * The same warnings during a solve, as one small icon that takes no room in the layout: a banner
 * appearing above the big time mid-solve would push the digits down. Positioned against its
 * (relative) parent; the text is its tooltip and label, and tapping it opens the text.
 */
export function StatusDot({ state }: { state: BannerState }) {
  const [open, setOpen] = useState(false);
  if (!anyBanner(state)) return null;
  const messages = [
    state.lowBatteryLevel !== null && lowBatteryText(state.lowBatteryLevel),
    state.reconnectNotice && reconnectText(state.reconnectNotice.lostMoves),
    state.faceletsUnreliable && `${UNRELIABLE_TEXT}. ${UNRELIABLE_HINT}`,
  ].filter((m): m is string => !!m);
  const label = messages.join(" ");
  const severe = state.lowBatteryLevel !== null;
  return (
    <span className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2" data-testid="status-dot">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={cn("hit flex h-5 w-5 items-center justify-center rounded-full", severe ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning")}
      >
        <span aria-hidden className={cn("h-2 w-2 rounded-full", severe ? "bg-danger" : "bg-warning")} />
      </button>
      {open && (
        <span role="status" className="absolute right-0 top-full z-30 mt-2 flex w-64 flex-col gap-2 rounded-xl border border-border-strong bg-bg-panel-2 p-3 text-left text-[12px] font-normal leading-4 text-foreground shadow-lg">
          {messages.map((m) => (
            <span key={m} className="block whitespace-normal">
              {m}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
