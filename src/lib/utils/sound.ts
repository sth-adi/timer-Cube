"use client";

import { useSettingsStore } from "@/lib/store/settingsStore";

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  return ctx;
}

/**
 * The context, woken if the browser put it to sleep (iOS interruptions, a tab
 * switch, no gesture yet). A cue scheduled on a suspended context just waits
 * and plays once it runs, so this doesn't have to be awaited; a refused
 * resume leaves that cue silent, nothing worse.
 */
function readyContext(): AudioContext | null {
  const audio = getContext();
  if (!audio) return null;
  if (audio.state !== "running") {
    try {
      void audio.resume().catch(() => {});
    } catch {
      // A browser that throws instead of rejecting: the cue stays silent.
    }
  }
  return audio;
}

/**
 * Create and wake the audio context. Browsers only allow that from a user
 * gesture, so call this from one (connecting the cube, arming a solve) —
 * otherwise the first inspection beep can land on a context that never started.
 */
export function primeAudio(): void {
  readyContext();
}

/** Nothing a cue plays is ever louder than this. */
export const MAX_CUE_GAIN = 0.2;

/** The WCA inspection cues' loudness and length — loud enough to cut through turning and a phone speaker. */
export const INSPECTION_BEEP_GAIN = 0.12;
export const INSPECTION_BEEP_MS = 110;

function beep(audio: AudioContext, freq: number, startOffset: number, durationMs: number, gain: number): void {
  const peak = Math.min(gain, MAX_CUE_GAIN);
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = audio.currentTime + startOffset;
  const t1 = t0 + durationMs / 1000;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t1);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/**
 * A cue that holds its level instead of decaying from the first instant: a
 * soft attack, a steady body, then a release — no click at either end, but
 * far more audible than a plucked note of the same length.
 */
function tone(audio: AudioContext, freq: number, startOffset: number, durationMs: number, gain: number): void {
  const peak = Math.min(gain, MAX_CUE_GAIN);
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = audio.currentTime + startOffset;
  const t1 = t0 + durationMs / 1000;
  const attack = 0.012;
  const release = 0.035;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t1 - release);
  g.gain.linearRampToValueAtTime(0, t1);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

function soundOn(): boolean {
  return useSettingsStore.getState().soundEnabled;
}

/** A short, unobtrusive confirmation chime for a recorded solve. */
export function playSolveChime(): void {
  const audio = soundOn() ? readyContext() : null;
  if (!audio) return;
  beep(audio, 880, 0, 90, 0.05);
}

/** A slightly brighter two-note chime for a personal best. */
export function playPBChime(): void {
  const audio = soundOn() ? readyContext() : null;
  if (!audio) return;
  beep(audio, 880, 0, 90, 0.06);
  beep(audio, 1318.5, 0.09, 160, 0.07);
}

/**
 * The WCA 15s inspection countdown's cues, as at competitions: one plain beep
 * at 8 seconds, and a clearly different higher two-tone at 12.
 */
export function playInspectionBeep(mark: 8 | 12 = 8): void {
  const audio = soundOn() ? readyContext() : null;
  if (!audio) return;
  if (mark === 12) {
    tone(audio, 880, 0, INSPECTION_BEEP_MS, INSPECTION_BEEP_GAIN);
    tone(audio, 1175, 0.14, INSPECTION_BEEP_MS, INSPECTION_BEEP_GAIN);
  } else {
    tone(audio, 660, 0, INSPECTION_BEEP_MS, INSPECTION_BEEP_GAIN);
  }
}

/**
 * Split Pacer's pace call: bright and rising when you're ahead of the
 * target split, a single mid note when you're on it, low and falling when
 * you're behind. Louder than the chimes — it has to cut through turning.
 */
export function playPaceTone(verdict: "ahead" | "on" | "behind"): void {
  const audio = readyContext();
  if (!audio) return;
  if (verdict === "ahead") {
    beep(audio, 784, 0, 70, 0.12);
    beep(audio, 1175, 0.08, 90, 0.12);
  } else if (verdict === "on") {
    beep(audio, 988, 0, 110, 0.1);
  } else {
    beep(audio, 392, 0, 90, 0.14);
    beep(audio, 262, 0.1, 140, 0.14);
  }
}
