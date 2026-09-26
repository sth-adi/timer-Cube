"use client";

import type { SoundCue } from "./highlights";

/** Pentatonic, so any run of turns sounds like a riff rather than noise. */
const FACE_HZ: Record<string, number> = { U: 523.25, D: 392.0, R: 659.25, L: 440.0, F: 783.99, B: 587.33 };

function tone(audio: AudioContext, out: AudioNode, at: number, hz: number, durS: number, gain: number, type: OscillatorType = "sine", toHz?: number) {
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  if (toHz) osc.frequency.exponentialRampToValueAtTime(toHz, at + durS);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + durS);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + durS + 0.02);
  return osc;
}

/**
 * Schedules a reel's soundtrack on the Web Audio clock, starting `fromMs`
 * into the cue list, played at `speed` (0.5 for slow-mo). Every node is
 * scheduled up front — a montage is a few hundred cues — so timing is
 * sample-accurate and independent of frame rate. Returns a stop function.
 */
export function playSoundtrack(audio: AudioContext, out: AudioNode, cues: readonly SoundCue[], speed = 1, fromMs = 0): () => void {
  const start = audio.currentTime + 0.05;
  const nodes: OscillatorNode[] = [];
  let beatN = 0;
  for (const c of cues) {
    if (c.atMs < fromMs) continue;
    const at = start + (c.atMs - fromMs) / 1000 / speed;
    switch (c.kind) {
      case "beat": {
        // Kick on every beat, a quieter off-note every other one.
        nodes.push(tone(audio, out, at, 120, 0.18, 0.22, "sine", 45));
        if (beatN++ % 2 === 1) nodes.push(tone(audio, out, at, 2400, 0.04, 0.025, "square"));
        break;
      }
      case "turn":
        nodes.push(tone(audio, out, at, FACE_HZ[c.face ?? "U"] ?? 523.25, 0.09, 0.05, "triangle"));
        break;
      case "card":
        nodes.push(tone(audio, out, at, 200, 0.35, 0.06, "sawtooth", 1400));
        break;
      case "finish":
        nodes.push(tone(audio, out, at, 880, 0.25, 0.09), tone(audio, out, at + 0.1, 1318.5, 0.35, 0.08));
        break;
      case "pb":
        nodes.push(
          tone(audio, out, at, 1046.5, 0.2, 0.1),
          tone(audio, out, at + 0.1, 1318.5, 0.2, 0.1),
          tone(audio, out, at + 0.2, 1568, 0.5, 0.11),
        );
        break;
    }
  }
  return () => {
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        // Already stopped.
      }
    }
  };
}

export function newAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}
