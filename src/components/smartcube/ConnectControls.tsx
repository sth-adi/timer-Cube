"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";

/** Why the connect screen is asking for a tap when the cube dropped on its own (see smartCubeStore's reconnectStopped). */
const STOPPED_COPY = {
  unsupported: "This browser can't reconnect to the cube on its own — tap Reconnect.",
  "gave-up": "Couldn't reach the cube for a few minutes. Check it's on and nearby, then tap Reconnect.",
  hidden: "Stopped trying while the app was in the background — tap Reconnect.",
} as const;

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

  return (
    <div className="flex flex-col items-center gap-2">
      {reconnect && !connecting && (
        <div className="flex flex-col items-center gap-1" data-testid="auto-reconnect" role="status">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" />
            {reconnect.trying ? `Reconnecting to ${lastCubeName ?? "your cube"}…` : `Waiting for ${lastCubeName ?? "your cube"} to come back…`}
            {reconnect.attempt > 1 && <span className="text-muted-2">· try {reconnect.attempt}</span>}
          </p>
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
        onClick={() => void connect()}
        disabled={connecting || !supported}
        className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
      >
        {connecting && <Loader2 size={14} className="animate-spin" />}
        {supported ? (connecting ? "Connecting…" : label) : (unsupportedLabel ?? label)}
      </button>
      {connecting && (
        <div className="flex flex-col items-center gap-1" data-testid="connect-progress">
          {status && <p className="text-xs text-muted">{status}</p>}
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
            onClick={() => void connect({ deviceName: lastCubeName })}
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
