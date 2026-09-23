"use client";

import { Bluetooth, Loader2 } from "lucide-react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";

/** Shown in place of a smart-cube-only tool until a cube is connected. */
export function ConnectGate({ children, blurb }: { children: React.ReactNode; blurb: string }) {
  const connected = useSmartCubeStore((s) => s.connected);
  const connecting = useSmartCubeStore((s) => s.connecting);
  const supported = useSmartCubeStore((s) => s.supported);
  const error = useSmartCubeStore((s) => s.error);
  const connect = useSmartCubeStore((s) => s.connect);
  if (connected) return <>{children}</>;
  return (
    <div className="card flex flex-col items-center gap-3 rounded-xl px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
        <Bluetooth size={22} className="text-accent" />
      </div>
      <p className="max-w-xs text-sm text-muted">{blurb}</p>
      <button
        type="button"
        onClick={() => void connect()}
        disabled={connecting || !supported}
        className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-50"
      >
        {connecting && <Loader2 size={14} className="animate-spin" />}
        {supported ? (connecting ? "Connecting…" : "Connect smart cube") : "Web Bluetooth unavailable in this browser"}
      </button>
      {error && <p className="max-w-xs text-xs text-danger">{error}</p>}
      <p className="max-w-xs text-[11px] text-muted-2">Connect it solved — that&apos;s the state the app tracks every turn from.</p>
    </div>
  );
}
