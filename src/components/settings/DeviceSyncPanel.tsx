"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { useSyncStore } from "@/lib/store/syncStore";
import { cn } from "@/lib/utils/cn";

const webrtcSupported = typeof window !== "undefined" && "RTCPeerConnection" in window;

function CodeBox({ label, value, hint }: { label: string; value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <textarea
        readOnly
        value={value}
        rows={3}
        className="w-full resize-none rounded-lg bg-bg-panel-2 p-2 font-mono text-[10px] leading-relaxed text-foreground outline-none"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-fg"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <p className="text-[11px] text-muted-2">{hint}</p>
      </div>
    </div>
  );
}

/**
 * Merges solve history with another device over a direct WebRTC connection —
 * no account, nothing running on our end (this app has no backend at all).
 * One device hosts and shares a connection code, the other pastes it back;
 * once connected both sides exchange their entire history and merge in
 * whatever they're each missing. Both devices need to be open at the same
 * time to do this — there's no server in between to relay it later.
 */
export function DeviceSyncPanel() {
  const {
    mode,
    busy,
    error,
    localCode,
    connected,
    phase,
    sentPct,
    receivedPct,
    result,
    startHosting,
    startJoining,
    submitOfferCode,
    submitAnswerCode,
    disconnect,
    reset,
  } = useSyncStore();

  const [pasteValue, setPasteValue] = useState("");

  useEffect(() => () => reset(), [reset]);

  if (!webrtcSupported) return null;

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-2">
        <Smartphone size={12} /> Sync with another device
      </p>

      {mode === "idle" && (
        <>
          <p className="mb-2 text-[11px] leading-relaxed text-muted-2">
            Bring your solve history from your other phone or laptop — direct device-to-device, both need to be open
            at once. No account, nothing passes through us.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void startHosting()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-medium text-foreground/90 hover:brightness-110"
            >
              Start on this device
            </button>
            <button
              type="button"
              onClick={startJoining}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-panel-2 px-3 py-2 text-xs font-medium text-foreground/90 hover:brightness-110"
            >
              Join from this device
            </button>
          </div>
        </>
      )}

      {mode === "hosting" && !connected && (
        <div className="flex flex-col gap-3">
          {busy && !localCode && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Setting up your connection…
            </p>
          )}
          {localCode && (
            <>
              <CodeBox
                label="1. Send this code to your other device"
                value={localCode}
                hint="Paste it into 'Join from this device' there."
              />
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-medium text-muted">2. Paste the code it sends back</p>
                <textarea
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                  rows={3}
                  placeholder="The other device's code…"
                  className="w-full resize-none rounded-lg bg-bg-panel-2 p-2 font-mono text-[10px] leading-relaxed outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => void submitAnswerCode(pasteValue)}
                  disabled={!pasteValue.trim() || busy}
                  className="self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-40"
                >
                  Connect
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === "joining" && !connected && (
        <div className="flex flex-col gap-3">
          {!localCode ? (
            <>
              <p className="text-[11px] font-medium text-muted">Paste the code your other device sent</p>
              <textarea
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                rows={3}
                placeholder="Its host code…"
                className="w-full resize-none rounded-lg bg-bg-panel-2 p-2 font-mono text-[10px] leading-relaxed outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => void submitOfferCode(pasteValue)}
                disabled={!pasteValue.trim() || busy}
                className="self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-40"
              >
                {busy ? "Working…" : "Generate my code"}
              </button>
            </>
          ) : (
            <>
              <CodeBox label="Send this code back" value={localCode} hint="Once it's pasted in, you'll connect automatically." />
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" /> Waiting to connect…
              </p>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

      {connected && (
        <div className="flex flex-col gap-2">
          {phase === "syncing" && (
            <>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <RefreshCw size={13} className={cn(sentPct < 100 || receivedPct < 100 ? "animate-spin" : "")} />
                Syncing…
              </p>
              <div className="space-y-1 text-[11px] text-muted-2">
                <div className="flex items-center justify-between">
                  <span>Sending</span>
                  <span className="tabular-nums">{sentPct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Receiving</span>
                  <span className="tabular-nums">{receivedPct}%</span>
                </div>
              </div>
            </>
          )}
          {phase === "done" && result && (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 size={13} />
              {syncSummary(result)}
            </p>
          )}
        </div>
      )}

      {mode !== "idle" && (
        <button type="button" onClick={disconnect} className="mt-2 text-[11px] text-muted-2 hover:text-danger">
          {phase === "done" ? "Close" : "Cancel"}
        </button>
      )}
    </div>
  );
}

/** "Added 3 solves, updated 1, removed 2." — or up to date. */
function syncSummary(r: { addedSolves: number; addedSessions: number; updated: number; removed: number }): string {
  const parts: string[] = [];
  if (r.addedSolves > 0 || r.addedSessions > 0) {
    parts.push(
      `added ${r.addedSolves} solve${r.addedSolves === 1 ? "" : "s"}${r.addedSessions > 0 ? ` in ${r.addedSessions} new session${r.addedSessions === 1 ? "" : "s"}` : ""}`,
    );
  }
  if (r.updated > 0) parts.push(`updated ${r.updated}`);
  if (r.removed > 0) parts.push(`removed ${r.removed} deleted on the other device`);
  if (parts.length === 0) return "Already up to date on this device.";
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
