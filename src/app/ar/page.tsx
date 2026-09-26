"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, CameraOff, Glasses, Loader2, Navigation, SwitchCamera, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { FaceletNet } from "@/components/scramble/ScrambleNet";
import { useSatNavRoute } from "@/components/satnav/useSatNavRoute";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { smoothTrack, trackCube, type TrackResult } from "@/lib/ar/cubeTracker";
import { cn } from "@/lib/utils/cn";

/** Downscaled frame the tracker reads — plenty for finding a cube, cheap on a phone. */
const TRACK_W = 96;
const TRACK_H = 72;
const TRACK_EVERY_MS = 80;
const TWIN_SIZE = 120;
/** The twin's on-screen footprint (three faces showing) relative to its edge. */
const TWIN_SPAN = 1.6;

/** How the twin is drawn to line up with what the camera sees. */
const VIEWS = {
  facing: { label: "Camera faces me", camera: "rotateX(-10deg) rotateY(180deg)" },
  behind: { label: "Camera behind me", camera: "rotateX(-24deg) rotateY(-32deg)" },
} as const;
type View = keyof typeof VIEWS;

type CamState = "idle" | "starting" | "live" | "denied" | "unsupported";

/** The Sat-Nav's next turn, floating above the cube in the camera view. */
function NextTurn() {
  const { nav } = useSatNavRoute();
  const token = nav.step?.display[nav.position];
  const turn = nav.step?.turns[nav.position];
  if (!nav.step || nav.step.stage === "solved") return nav.step ? <Bubble text="Solved!" /> : null;
  if (!token) return null;
  return <Bubble text={token} sub={nav.step.title} swatch={turn ? FACELET_COLORS[turn[0]] : undefined} />;
}

function Bubble({ text, sub, swatch }: { text: string; sub?: string; swatch?: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-black/70 px-3 py-1.5 text-white shadow-lg backdrop-blur">
      <span className="flex items-center gap-1.5 font-mono text-2xl font-black">
        {swatch && <span className="h-3 w-3 rounded-sm ring-1 ring-white/40" style={{ background: swatch }} />}
        {text}
      </span>
      {sub && <span className="text-[10px] text-white/70">{sub}</span>}
    </div>
  );
}

/**
 * Cube AR: your phone or laptop camera, with the Gyro Twin pinned onto the
 * real cube in the picture. The cube is found in each frame by its
 * sticker colors (lib/ar/cubeTracker); its orientation comes from the
 * cube's own gyro, not the image. Turn the twin translucent to line it up
 * over the real thing, or float the Sat-Nav's next turn above it.
 */
function CubeAR() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<TrackResult | null>(null);
  const [cam, setCam] = useState<CamState>("idle");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [view, setView] = useState<View>("facing");
  const [opacity, setOpacity] = useState(0.85);
  const [directions, setDirections] = useState(false);
  const [found, setFound] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);
  const facelets = useSmartCubeStore((s) => s.liveFacelets);
  const mirrored = facing === "user";

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: "user" | "environment") => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCam("unsupported");
        return;
      }
      stop();
      setCam("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setFacing(mode);
        setView(mode === "user" ? "facing" : "behind");
        setCam("live");
      } catch {
        setCam("denied");
      }
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  // Tracking loop: read a small frame, find the cube, write its place into CSS variables (no React re-render per frame).
  useEffect(() => {
    if (cam !== "live") return;
    const canvas = document.createElement("canvas");
    canvas.width = TRACK_W;
    canvas.height = TRACK_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const t = window.setInterval(() => {
      const v = videoRef.current;
      const stage = stageRef.current;
      if (!ctx || !v || !stage || v.readyState < 2) return;
      ctx.drawImage(v, 0, 0, TRACK_W, TRACK_H);
      const raw = trackCube(ctx.getImageData(0, 0, TRACK_W, TRACK_H).data, TRACK_W, TRACK_H);
      const r = smoothTrack(trackRef.current, raw);
      trackRef.current = r;
      setFound((f) => (f === r.found ? f : r.found));
      if (!r.found) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const px = Math.max(r.w * w, r.h * h);
      stage.style.setProperty("--ar-x", `${(mirrored ? 1 - r.cx : r.cx) * w}px`);
      stage.style.setProperty("--ar-y", `${r.cy * h}px`);
      stage.style.setProperty("--ar-s", String(px / (TWIN_SIZE * TWIN_SPAN)));
      stage.style.setProperty("--ar-top", `${r.cy * h - px / 2}px`);
    }, TRACK_EVERY_MS);
    return () => window.clearInterval(t);
  }, [cam, mirrored]);

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={stageRef}
        className="relative w-full overflow-hidden rounded-2xl bg-black"
        style={{ aspectRatio: String(aspect), ["--ar-x" as string]: "50%", ["--ar-y" as string]: "50%", ["--ar-s" as string]: "1", ["--ar-top" as string]: "20%" }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          onLoadedMetadata={(e) => e.currentTarget.videoWidth && setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight)}
          className={cn("absolute inset-0 h-full w-full object-cover", mirrored && "-scale-x-100")}
        />
        {cam === "live" && (
          <>
            <div
              className="pointer-events-none absolute transition-[left,top,transform] duration-100 ease-out"
              style={{
                left: "var(--ar-x)",
                top: "var(--ar-y)",
                opacity: found ? opacity : 0.25,
                transform: `translate(-50%, -50%) scale(var(--ar-s)) ${mirrored ? "scaleX(-1)" : ""}`,
              }}
            >
              <GyroTwin size={TWIN_SIZE} showControls={false} camera={VIEWS[view].camera} />
            </div>
            {directions && (
              <div
                className="pointer-events-none absolute transition-[left,top] duration-100 ease-out"
                style={{ left: "var(--ar-x)", top: "var(--ar-top)", transform: "translate(-50%, -115%)" }}
              >
                <NextTurn />
              </div>
            )}
            <span
              className={cn(
                "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                found ? "bg-success/80 text-white" : "bg-black/60 text-white/80",
              )}
            >
              {found ? "Tracking your cube" : "Hold your cube up to the camera"}
            </span>
          </>
        )}
        {cam !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {cam === "starting" ? (
              <Loader2 size={22} className="animate-spin" />
            ) : cam === "denied" ? (
              <>
                <CameraOff size={24} />
                <p className="text-sm">Camera access was blocked. Allow it for this site in your browser settings, then try again.</p>
              </>
            ) : cam === "unsupported" ? (
              <>
                <CameraOff size={24} />
                <p className="text-sm">This browser can&apos;t open the camera.</p>
              </>
            ) : (
              <Glasses size={26} />
            )}
            {cam !== "starting" && cam !== "unsupported" && (
              <button
                type="button"
                onClick={() => void start(facing)}
                className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
              >
                <Camera size={14} /> Start camera
              </button>
            )}
          </div>
        )}
      </div>

      {cam === "live" && (
        <div className="card flex flex-col gap-3 rounded-xl p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void start(facing === "user" ? "environment" : "user")}
              className="flex items-center gap-1 rounded-full bg-bg-panel-2 px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <SwitchCamera size={12} /> {facing === "user" ? "Front camera" : "Back camera"}
            </button>
            <div className="flex overflow-hidden rounded-full bg-bg-panel-2 text-xs">
              {(Object.keys(VIEWS) as View[]).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={cn("px-3 py-1.5 font-medium", view === v ? "bg-accent-soft text-accent" : "text-muted")}>
                  {VIEWS[v].label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDirections((d) => !d)}
              aria-pressed={directions}
              className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium", directions ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted")}
            >
              <Navigation size={12} /> Directions
            </button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            X-ray
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
              aria-label="Twin opacity"
            />
            Solid
          </label>
          {!gyroActive && <p className="text-[11px] text-warning">This cube doesn&apos;t report a gyro, so the twin stays upright instead of following your tilts.</p>}
        </div>
      )}

      <div className="card flex items-center gap-3 rounded-xl p-3">
        <div className="w-28 shrink-0">
          <FaceletNet facelets={facelets} className="w-full" />
        </div>
        <p className="text-[11px] text-muted">
          All six faces, live — including the ones facing away from you. Hold the cube yellow on top, green toward you, and tap Re-center in the Lab if
          the twin&apos;s angle drifts.
        </p>
      </div>
    </div>
  );
}

export default function ARPage() {
  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Glasses size={17} className="text-accent" /> Cube AR
            </h1>
            <p className="text-[11px] text-muted-2">
              The Gyro Twin, pinned onto your real cube through the camera — found by its stickers, turned by its gyro. Nothing leaves your device.
            </p>
          </div>
          <ConnectGate blurb="Cube AR draws your smart cube's live twin over the camera view, so it needs one connected.">
            <CubeAR />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
