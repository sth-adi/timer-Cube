"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { preloadCubeViewer } from "@/components/timer/LiveCubeMimic";
import { cn } from "@/lib/utils/cn";
import { CONNECT_HINTS, CONNECT_STEPS, HOLD_LINE, RECONNECT_HINTS, SLOW_CONNECT_MS, connectStep, reconnectLine } from "./connectSteps";

/** Why the connect screen is asking for a tap when the cube dropped on its own (see smartCubeStore's reconnectStopped). */
const STOPPED_COPY = {
  unsupported: "This browser can't reconnect to the cube on its own — tap Reconnect.",
  "gave-up": "Couldn't reach the cube for a few minutes. Check it's on and nearby, then tap Reconnect.",
  hidden: "Stopped trying while the app was in the background — tap Reconnect.",
} as const;

/** Three small dots — pick, address, connect — lit from the store's real connect status; the current one pulses. */
function ConnectSteps({ step }: { step: number }) {
  return (
    <ol aria-label="Connection steps" className="flex items-center text-[10px]" data-testid="connect-steps">
      {CONNECT_STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center">
          {i > 0 && <span aria-hidden className={cn("mx-1.5 h-px w-4", i <= step ? "bg-accent" : "bg-border-strong")} />}
          <span className={cn("flex items-center gap-1", i < step ? "text-muted" : i === step ? "font-medium text-foreground" : "text-muted-2")}>
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", i <= step ? "bg-accent" : "bg-border-strong", i === step && "animate-pulse")} />
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Quiet suggestions that appear only once a connection has been taking a
 * while. Mounted fresh for each wait (the parent decides when), so its timer
 * starts then and its state resets on unmount — no reset logic of its own.
 */
function SlowHints({ hints, testId }: { hints: readonly string[]; testId: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(id);
  }, []);
  if (!slow) return null;
  return (
    <ul className="flex max-w-xs flex-col items-center gap-0.5 text-center text-[11px] text-muted-2" data-testid={testId}>
      {hints.map((h) => (
        <li key={h}>{h}</li>
      ))}
    </ul>
  );
}

/**
 * The connect button and everything around it: what the connection is doing
 * while it works (picking, reading the cube's address, connecting), a way to
 * give up, and — once you've used a cube before — a one-tap way back to
 * that specific one, narrowing the browser's Bluetooth list to it. After an
 * unexpected drop the store tries to get the cube back by itself first; this
 * shows that going on, with Try now and Cancel.
 */
export function ConnectControls({ label = "Connect smart cube", unsupportedLabel }: { label?: string; unsupportedLabel?: string }) {
  const connecting = useSmartCubeStore((s) => s.connecting);
  const supported = useSmartCubeStore((s) => s.supported);
  const status = useSmartCubeStore((s) => s.connectStatus);
  const lastCubeName = useSmartCubeStore((s) => s.lastCubeName);
  const connect = useSmartCubeStore((s) => s.connect);
  const cancelConnect = useSmartCubeStore((s) => s.cancelConnect);
  const forgetLastCube = useSmartCubeStore((s) => s.forgetLastCube);
  const reconnect = useSmartCubeStore((s) => s.reconnect);
  const reconnectStopped = useSmartCubeStore((s) => s.reconnectStopped);
  const cancelReconnect = useSmartCubeStore((s) => s.cancelReconnect);
  const reconnectNow = useSmartCubeStore((s) => s.reconnectNow);
  const macRequest = useSmartCubeStore((s) => s.macRequest);
  const step = connectStep(status);

  return (
    <div className="flex flex-col items-center gap-2">
      {reconnect && !connecting && (
        <div className="flex flex-col items-center gap-1" data-testid="auto-reconnect" role="status">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" />
            {reconnectLine(lastCubeName, reconnect.trying)}
            {reconnect.attempt > 1 && <span className="text-muted-2">· try {reconnect.attempt}</span>}
          </p>
          <SlowHints hints={RECONNECT_HINTS} testId="auto-reconnect-hints" />
          <div className="flex items-center gap-3 text-[11px]">
            {!reconnect.trying && (
              <button type="button" onClick={reconnectNow} className="text-accent underline hover:brightness-110" data-testid="auto-reconnect-now">
                Try now
              </button>
            )}
            <button type="button" onClick={cancelReconnect} className="text-muted-2 underline hover:text-muted" data-testid="auto-reconnect-cancel">
              Cancel
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          // The first mimic render happens mid-inspection; fetch the 3D viewer now instead.
          preloadCubeViewer();
          void connect();
        }}
        disabled={connecting || supported !== true}
        className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
      >
        {connecting && <Loader2 size={14} className="animate-spin" />}
        {supported === false ? (unsupportedLabel ?? label) : connecting ? "Connecting…" : label}
      </button>
      {!connecting && !reconnect && supported === true && (
        <p className="max-w-xs text-center text-[11px] text-muted-2" data-testid="connect-hold-line">
          {HOLD_LINE}
        </p>
      )}
      {connecting && (
        <div className="flex flex-col items-center gap-1.5" data-testid="connect-progress">
          <ConnectSteps step={step} />
          {status && (
            <p role="status" className="text-xs text-muted">
              {status}
            </p>
          )}
          {/* Not while the browser's list is open (that wait is yours), nor while it's asking you for the address. */}
          {step >= 1 && !macRequest && <SlowHints hints={CONNECT_HINTS} testId="connect-hints" />}
          <button type="button" onClick={cancelConnect} className="text-[11px] text-muted-2 underline hover:text-muted" data-testid="connect-cancel">
            Cancel
          </button>
        </div>
      )}
      {!connecting && !reconnect && reconnectStopped && <p className="max-w-xs text-center text-[11px] text-muted">{STOPPED_COPY[reconnectStopped]}</p>}
      {!connecting && !reconnect && supported && lastCubeName && (
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => {
              preloadCubeViewer();
              void connect({ deviceName: lastCubeName });
            }}
            className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-2.5 py-1 font-medium text-foreground hover:bg-bg-panel"
            title="Only show this cube in the Bluetooth list"
            data-testid="reconnect-last"
          >
            <RotateCw size={11} /> Reconnect {lastCubeName}
          </button>
          <button type="button" onClick={forgetLastCube} className="text-muted-2 underline hover:text-muted">
            Forget
          </button>
        </div>
      )}
    </div>
  );
}
