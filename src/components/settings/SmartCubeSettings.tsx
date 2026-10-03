"use client";

import { useMemo, useState } from "react";
import { Bluetooth, BluetoothConnected, Pencil } from "lucide-react";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { VOICE_MODES } from "@/lib/smartcube/voiceCoach";
import { cubeIdentity } from "@/lib/smartcube/cubeIdentity";
import { Toggle } from "./SettingsPanel";
import { cn } from "@/lib/utils/cn";

/** One name field for a cube — saves on blur or Enter, empty goes back to the name the cube advertises. */
function NicknameRow({ id, name, nickname, detail, connected }: { id: string; name: string; nickname: string | undefined; detail?: string; connected?: boolean }) {
  const setNickname = useSettingsStore((s) => s.setCubeNickname);
  const [draft, setDraft] = useState(nickname ?? "");
  return (
    <div className="flex items-center gap-2 rounded-lg bg-bg-panel-2 px-2.5 py-2" data-testid="cube-row">
      {connected ? <BluetoothConnected size={14} className="shrink-0 text-success" /> : <Bluetooth size={14} className="shrink-0 text-muted-2" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <input
          value={draft}
          maxLength={24}
          placeholder={name}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setNickname(id, draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label={`Nickname for ${name}`}
          className="min-w-0 bg-transparent text-[16px] font-medium text-foreground outline-none placeholder:text-foreground/70 sm:text-sm"
        />
        {detail && <span className="truncate text-[11px] text-muted-2">{detail}</span>}
      </div>
      <Pencil size={11} className="shrink-0 text-muted-2" aria-hidden />
    </div>
  );
}

/**
 * Everything about smart cubes in one place: how the app talks to you while
 * you solve (voice, scramble reading), how you scramble (freestyle), how it
 * behaves (keeping the screen on, gestures), and the cubes themselves —
 * names you've given them, and the one you're connected to now.
 */
export function SmartCubeSettings() {
  const voiceCoach = useSettingsStore((s) => s.voiceCoach);
  const setVoiceCoach = useSettingsStore((s) => s.setVoiceCoach);
  const voiceScramble = useSettingsStore((s) => s.voiceScramble);
  const setVoiceScramble = useSettingsStore((s) => s.setVoiceScramble);
  const freestyle = useSettingsStore((s) => s.freestyle);
  const setFreestyle = useSettingsStore((s) => s.setFreestyle);
  const keepAwake = useSettingsStore((s) => s.keepAwake);
  const setKeepAwake = useSettingsStore((s) => s.setKeepAwake);
  const gestures = useSettingsStore((s) => s.cubeGestures);
  const setGestures = useSettingsStore((s) => s.setCubeGestures);
  const nicknames = useSettingsStore((s) => s.cubeNicknames);
  const allSolves = useSessionStore((s) => s.allSolves);
  const { connected, deviceName, deviceMac, protocolName, batteryLevel, hardwareInfo, disconnect, lastCubeName, forgetLastCube } = useSmartCubeStore();

  const here = useMemo(() => cubeIdentity({ deviceMac, deviceName, protocolName }), [deviceMac, deviceName, protocolName]);
  // Every cube a solve has been made on, newest first (plus the connected one even before its first solve).
  const cubes = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; protocol?: string; last: number }>();
    for (const s of allSolves) {
      if (!s.cube) continue;
      const prev = byId.get(s.cube.id);
      if (!prev || s.date > prev.last) byId.set(s.cube.id, { id: s.cube.id, name: s.cube.name, protocol: s.cube.protocol, last: s.date });
    }
    if (here && !byId.has(here.id)) byId.set(here.id, { id: here.id, name: here.name, protocol: here.protocol, last: Number.MAX_SAFE_INTEGER });
    return [...byId.values()].sort((a, b) => b.last - a.last);
  }, [allSolves, here]);

  return (
    <div className="mt-4 border-t border-border pt-3" data-testid="smartcube-settings">
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-2">Smart cube</p>

      <p className="mb-1 text-xs text-muted">Voice coach</p>
      <div className="grid grid-cols-3 gap-1.5">
        {VOICE_MODES.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVoiceCoach(v.id)}
            aria-pressed={voiceCoach === v.id}
            className={cn("min-h-10 rounded-lg px-2 py-2 text-xs font-medium transition-colors", voiceCoach === v.id ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground")}
          >
            {v.name}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
        {voiceCoach === "off"
          ? "Silent."
          : voiceCoach === "splits"
            ? "Calls each phase the moment the cube finishes it, then your time."
            : "Splits, plus the 8 and 12-second inspection marks, whether each phase ran fast or slow for you, and a personal-best call."}
      </p>

      <div className="mt-1 divide-y divide-border">
        <Toggle checked={voiceScramble} onChange={setVoiceScramble} label="Read the scramble aloud" />
        <Toggle checked={freestyle} onChange={setFreestyle} label="Freestyle scrambling (mix it yourself)" />
        <Toggle checked={gestures} onChange={setGestures} label="Cube gestures between solves" />
        <Toggle checked={keepAwake} onChange={setKeepAwake} label="Keep the screen awake while the timer is open" />
      </div>

      <p className="mb-1 mt-3 text-xs text-muted">Your cubes</p>
      {connected && (
        <p className="mb-2.5 text-[11px] leading-snug text-muted-2" data-testid="connected-cube">
          Connected: <span className="text-foreground">{nicknames[here?.id ?? ""] ?? deviceName}</span>
          {protocolName ? ` · ${protocolName}` : ""}
          {batteryLevel !== null ? ` · ${batteryLevel}% battery` : ""}
          {hardwareInfo?.softwareVersion ? ` · firmware ${hardwareInfo.softwareVersion}` : ""}
          {" · "}
          <button type="button" onClick={disconnect} className="hit-y underline hover:text-muted">
            Disconnect
          </button>
        </p>
      )}
      {cubes.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-muted-2">Cubes you solve on show up here, where you can give each a name.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {cubes.map((c) => (
            <NicknameRow key={c.id} id={c.id} name={c.name} nickname={nicknames[c.id]} detail={[c.protocol, c.id.startsWith("mac:") ? c.id.slice(4) : null].filter(Boolean).join(" · ")} connected={connected && here?.id === c.id} />
          ))}
        </div>
      )}
      {lastCubeName && !connected && (
        <p className="mt-2 text-[11px] text-muted-2">
          The connect screen offers a one-tap reconnect to <span className="text-foreground">{lastCubeName}</span>.{" "}
          <button type="button" onClick={forgetLastCube} className="hit-y underline hover:text-muted">
            Forget it
          </button>
        </p>
      )}
    </div>
  );
}
