"use client";

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  return ctx;
}

function beep(freq: number, startOffset: number, durationMs: number, gain: number): void {
  const audio = getContext();
  if (!audio) return;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = audio.currentTime + startOffset;
  const t1 = t0 + durationMs / 1000;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t1);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/** A short, unobtrusive confirmation chime for a recorded solve. */
export function playSolveChime(): void {
  beep(880, 0, 90, 0.05);
}

/** A slightly brighter two-note chime for a personal best. */
export function playPBChime(): void {
  beep(880, 0, 90, 0.06);
  beep(1318.5, 0.09, 160, 0.07);
}

/** A short warning beep for the WCA 15s inspection countdown, matching the 8s/12s cues used at competitions. */
export function playInspectionBeep(): void {
  beep(660, 0, 70, 0.045);
}
