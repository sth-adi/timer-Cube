"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Download, Loader2, Play, Share2, Square } from "lucide-react";
import { INTRO_MS, OUTRO_MS, REEL_H, REEL_W, renderReelFrame, type ReelStyle } from "@/lib/reel/renderFrame";
import type { ReelTimeline } from "@/lib/reel/timeline";
import { cn } from "@/lib/utils/cn";

const MIME_CANDIDATES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

function themeAccent(): string {
  if (typeof document === "undefined") return "#7c5cff";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#7c5cff";
}

type Mode = "idle" | "playing" | "recording";

interface ReelPlayerProps {
  timeline: ReelTimeline;
  title: string;
  subtitle: string;
  fileName: string;
}

/**
 * Plays a Solve Reel on a canvas, and records it to a video file with
 * MediaRecorder — real-time, so the video runs at the solve's real pace
 * (or half speed for a slow-mo reel).
 */
export function ReelPlayer({ timeline, title, subtitle, fileName }: ReelPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [speed, setSpeed] = useState(1);
  const [video, setVideo] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const [supported] = useState(() => pickMime() !== null);

  const draw = useCallback(
    (t: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const style: ReelStyle = { accent: themeAccent(), title, subtitle };
      renderReelFrame(ctx, timeline, t, style);
    },
    [timeline, title, subtitle],
  );

  // Poster frame whenever the solve changes.
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    draw(-1);
  }, [draw]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (video) URL.revokeObjectURL(video.url);
    };
  }, [video]);

  const run = useCallback(
    (record: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      cancelAnimationFrame(rafRef.current);
      let recorder: MediaRecorder | null = null;
      if (record) {
        const mime = pickMime();
        if (!mime) return;
        const chunks: Blob[] = [];
        recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
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
      const start = performance.now();
      const end = timeline.totalMs + OUTRO_MS;
      const tick = (now: number) => {
        const t = (now - start) * speed - INTRO_MS;
        draw(t);
        if (t < end) {
          rafRef.current = requestAnimationFrame(tick);
        } else if (recorder) {
          recorder.stop();
        } else {
          setMode("idle");
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [draw, speed, timeline.totalMs],
  );

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
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
        aria-label="Solve reel preview"
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
      </div>
      {mode === "recording" && (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <Loader2 size={12} className="animate-spin" /> Recording in real time — keep this tab in front
        </p>
      )}
      {!supported && <p className="text-xs text-muted-2">This browser can&apos;t record canvas video — preview still works.</p>}
      {video && !busy && (
        <div className="flex flex-col items-center gap-2">
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
        </div>
      )}
    </div>
  );
}
