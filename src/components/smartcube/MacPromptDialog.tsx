"use client";

import { useState } from "react";
import { Bluetooth } from "lucide-react";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { normalizeMac } from "@/lib/smartcube/connectMemory";

/**
 * The connection library needs the cube's Bluetooth address to talk to it,
 * and some browsers won't hand it over. When that happens it asks here, and
 * the answer is remembered by the library once the cube has answered with
 * it — so this is a one-time thing per cube.
 */
export function MacPromptDialog() {
  const request = useSmartCubeStore((s) => s.macRequest);
  const submitMac = useSmartCubeStore((s) => s.submitMac);
  if (!request) return null;
  // Remounted per request (keyed on the cube) so a second prompt starts empty.
  return <MacForm key={request.deviceName ?? "cube"} deviceName={request.deviceName} onSubmit={submitMac} />;
}

function MacForm({ deviceName, onSubmit }: { deviceName: string | null; onSubmit: (mac: string | null) => void }) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const mac = normalizeMac(text);
  const invalid = touched && text.trim() !== "" && !mac;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Enter the cube's Bluetooth address" data-testid="mac-dialog">
      <form
        className="card flex w-full max-w-sm flex-col gap-3 rounded-2xl p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (mac) onSubmit(mac);
        }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Bluetooth size={16} />
          </span>
          <h2 className="text-base font-semibold text-foreground">{deviceName ? `${deviceName} needs its address` : "This cube needs its address"}</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Your browser won&apos;t tell this app the cube&apos;s Bluetooth address, and it&apos;s needed to read the cube. Type it in once — it&apos;s remembered after that. You can find it in the cube&apos;s own app (look for device info), or in your phone&apos;s Bluetooth details for the cube.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-2">Bluetooth address</span>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="AA:BB:CC:DD:EE:FF"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid}
            className="rounded-lg bg-bg-panel-2 px-3 py-2 font-mono text-sm text-foreground outline-none ring-1 ring-border focus:ring-accent aria-[invalid=true]:ring-danger"
            data-testid="mac-input"
          />
          {invalid && <span className="text-[11px] text-danger">That should be six pairs of letters and numbers, like AA:BB:CC:DD:EE:FF.</span>}
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={!mac} className="flex-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-40" data-testid="mac-submit">
            Connect
          </button>
          <button type="button" onClick={() => onSubmit(null)} className="rounded-full bg-bg-panel-2 px-4 py-2 text-sm font-medium text-muted hover:text-foreground">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
