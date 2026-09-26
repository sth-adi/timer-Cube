"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Download, Loader2, Music, Play, Share2, Square, VolumeX } from "lucide-react";
import { REEL_H, REEL_W } from "@/lib/reel/renderFrame";
import type { SoundCue } from "@/lib/reel/highlights";
import { newAudioContext, playSoundtrack } from "@/lib/reel/soundtrack";
import { cn } from "@/lib/utils/cn";

const MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function themeAccent(): string {
  if (typeof document === "undefined") return "#7c5cff";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#7c5cff";
}

type Mode = "idle" | "playing" | "recording";

interface CanvasRecorderProps {
  /** Draws the frame at time `t` (in the caller's own timeline). */
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
  /** Playback runs `t` from `fromT` to `toT`. */
  fromT: number;
  toT: number;
  /** Frame shown when idle. */
  posterT: number;
  /** Soundtrack cues, `atMs` measured from `fromT`. */
  soundtrack?: SoundCue[];
  title: string;
  fileName: string;
  ariaLabel?: string;
}

/**
 * Plays a canvas animation and records it — picture and soundtrack — to a
 * video file with MediaRecorder, in real time (or half speed for slow-mo).
 * The soundtrack is synthesized on the Web Audio clock and mixed straight
 * into the recording, so the downloaded video has sound too.
 */
export function CanvasRecorder({ draw, fromT, toT, posterT, soundtrack, title, fileName, ariaLabel }: CanvasRecorderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [speed, setSpeed] = useState(1);
  const [sound, setSound] = useState(true);
  const [video, setVideo] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const [supported] = useState(() => pickMime() !== null);

  const paint = useCallback(
    (t: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) draw(ctx, t);
    },
    [draw],
  );

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    paint(posterT);
  }, [paint, posterT]);

  const halt = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopAudioRef.current?.();
    stopAudioRef.current = null;
  }, []);

  useEffect(
    () => () => {
      halt();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      void audioRef.current?.close();
    },
    [halt],
  );

  useEffect(() => () => void (video && URL.revokeObjectURL(video.url)), [video]);

  const run = useCallback(
    (record: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      halt();
      let recorder: MediaRecorder | null = null;
      const withSound = sound && !!soundtrack?.length;
      let audioOut: MediaStreamAudioDestinationNode | null = null;
      if (withSound) {
        audioRef.current ??= newAudioContext();
        const audio = audioRef.current;
        if (audio) {
          void audio.resume();
          const bus = audio.createGain();
          bus.gain.value = 0.9;
          bus.connect(audio.destination);
          if (record) {
            audioOut = audio.createMediaStreamDestination();
            bus.connect(audioOut);
          }
          const stopCues = playSoundtrack(audio, bus, soundtrack!, speed);
          stopAudioRef.current = () => {
            stopCues();
            bus.disconnect();
          };
        }
      }
      if (record) {
        const mime = pickMime();
        if (!mime) return;
        const chunks: Blob[] = [];
        const tracks = [...canvas.captureStream(30).getVideoTracks(), ...(audioOut?.stream.getAudioTracks() ?? [])];
        recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
        recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mime.split(";")[0] });
          setVideo({ url: URL.createObjectURL(blob), blob, ext: mime.includes("mp4") ? "mp4" : "webm" });
          setMode("idle");
        };
        recorderRef.current = recorder;
        recorder.start(250);
      }
      setMode(record ? "recording" : "playing");
      // The audio is scheduled 50ms ahead; start the picture clock with it.
      const start = performance.now() + 50;
      const tick = (now: number) => {
        const t = fromT + Math.max(0, now - start) * speed;
        paint(t);
        if (t < toT) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          halt();
          if (recorder) recorder.stop();
          else setMode("idle");
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [paint, speed, sound, soundtrack, fromT, toT, halt],
  );

  const stop = () => {
    halt();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else setMode("idle");
  };

  const share = async () => {
    if (!video) return;
    const file = new File([video.blob], `${fileName}.${video.ext}`, { type: video.blob.type });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title }).catch(() => {});
    }
  };

  const busy = mode !== "idle";
  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={REEL_W}
        height={REEL_H}
        className="w-full max-w-sm rounded-2xl shadow-2xl ring-1 ring-white/10"
        aria-label={ariaLabel ?? title}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {busy ? (
          <button type="button" onClick={stop} className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-sm font-semibold text-foreground">
            <Square size={12} fill="currentColor" /> Stop
          </button>
        ) : (
          <>
            <button type="button" onClick={() => run(false)} className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-sm font-semibold text-foreground">
              <Play size={13} /> Preview
            </button>
            <button
              type="button"
              onClick={() => run(true)}
              disabled={!supported}
              className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-40"
            >
              <Circle size={11} fill="currentColor" /> Record video
            </button>
          </>
        )}
        <div className="flex overflow-hidden rounded-full bg-bg-panel-2 text-xs">
          {[1, 0.5].map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => setSpeed(s)}
              className={cn("px-3 py-2 font-medium", speed === s ? "bg-accent-soft text-accent" : "text-muted")}
            >
              {s === 1 ? "Real speed" : "Slow-mo"}
            </button>
          ))}
        </div>
        {soundtrack && soundtrack.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setSound((v) => !v)}
            aria-pressed={sound}
            className={cn("flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium", sound ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted")}
          >
            {sound ? <Music size={12} /> : <VolumeX size={12} />} Soundtrack
          </button>
        )}
      </div>
      {mode === "recording" && (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <Loader2 size={12} className="animate-spin" /> Recording in real time — keep this tab in front
        </p>
      )}
      {!supported && <p className="text-xs text-muted-2">This browser can&apos;t record canvas video — preview still works.</p>}
      {video && !busy && (
        <div className="flex gap-2">
          <a
            href={video.url}
            download={`${fileName}.${video.ext}`}
            className="flex items-center gap-1.5 rounded-full bg-success px-4 py-2 text-sm font-semibold text-white"
          >
            <Download size={13} /> Download video
          </a>
          <button type="button" onClick={() => void share()} className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-sm font-semibold text-foreground">
            <Share2 size={13} /> Share
          </button>
        </div>
      )}
    </div>
  );
}
