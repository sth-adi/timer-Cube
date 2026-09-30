"use client";

import { Bluetooth } from "lucide-react";
import { ConnectControls } from "./ConnectControls";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";

/** Shown in place of a smart-cube-only tool until a cube is connected. */
export function ConnectGate({ children, blurb }: { children: React.ReactNode; blurb: string }) {
  const connected = useSmartCubeStore((s) => s.connected);
  const error = useSmartCubeStore((s) => s.error);
  if (connected) return <>{children}</>;
  return (
    <div className="card flex flex-col items-center gap-3 rounded-xl px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
        <Bluetooth size={22} className="text-accent" />
      </div>
      <p className="max-w-xs text-sm text-muted">{blurb}</p>
      <ConnectControls unsupportedLabel="Web Bluetooth unavailable in this browser" />
      {error && <p className="max-w-xs text-xs text-danger">{error}</p>}
      <p className="max-w-xs text-[11px] text-muted-2">Any state is fine — most cubes report where every piece is. (A MoYu MHC can&apos;t: connect that one solved.)</p>
    </div>
  );
}
