"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";

/**
 * The connect button and everything around it: what the connection is doing
 * while it works (picking, reading the cube's address, connecting), a way to
 * give up, and — once you've used a cube before — a one-tap way back to
 * that specific one, narrowing the browser's Bluetooth list to it.
 */
export function ConnectControls({ label = "Connect smart cube", unsupportedLabel }: { label?: string; unsupportedLabel?: string }) {
  const connecting = useSmartCubeStore((s) => s.connecting);
  const supported = useSmartCubeStore((s) => s.supported);
  const status = useSmartCubeStore((s) => s.connectStatus);
  const lastCubeName = useSmartCubeStore((s) => s.lastCubeName);
  const connect = useSmartCubeStore((s) => s.connect);
  const cancelConnect = useSmartCubeStore((s) => s.cancelConnect);
  const forgetLastCube = useSmartCubeStore((s) => s.forgetLastCube);

  return (
    <div className="flex flex-col items-center gap-2">
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
      {!connecting && supported && lastCubeName && (
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
