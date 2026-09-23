"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bluetooth,
  Clover,
  Clapperboard,
  Compass,
  Crosshair,
  Dumbbell,
  EyeClosed,
  Eye,
  Fingerprint,
  Flame,
  FlaskConical,
  Gauge,
  Hand,
  HeartPulse,
  History,
  Loader2,
  Medal,
  Metronome,
  Navigation,
  Radar,
  RefreshCcw,
  Rotate3d,
  Scale,
  Shapes,
  Sigma,
  ScanLine,
  Stethoscope,
  Swords,
  Target,
  Thermometer,
  Timer as TimerIcon,
  TrendingUp,
} from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { GyroTwin } from "@/components/lab/GyroTwin";
import { GyroCalibration } from "@/components/lab/GyroCalibration";
import { GestureLegend, GestureToast } from "@/components/lab/GestureToast";
import { MistakeHistory } from "@/components/lab/MistakeHistory";
import { CubeHealthPanel } from "@/components/lab/CubeHealthPanel";
import { useSmartCubeStore } from "@/lib/store/smartCubeStore";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useCubeGestures } from "@/hooks/useCubeGestures";
import { GESTURE_BINDINGS, type GestureAction } from "@/lib/smartcube/gestures";
import { buildCubeHealthReport } from "@/lib/analysis/cubeHealth";
import { cn } from "@/lib/utils/cn";

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 rounded-xl p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h2>
        <p className="text-[11px] text-muted-2">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

const TOOLS = [
  { href: "/sob", icon: Medal, title: "Sum of Best", blurb: "Your best cross, pairs, OLL and PLL added up — and your golds." },
  { href: "/luck", icon: Clover, title: "Luck Meter", blurb: "How much each solve was the scramble, and your luck-free leaderboard." },
  { href: "/archetypes", icon: Shapes, title: "Solve Archetypes", blurb: "The shapes your solves come in, clustered, and what each costs." },
  { href: "/stalls", icon: Flame, title: "Stall Map", blurb: "A heatmap of where in each phase your pauses land." },
  { href: "/autopsy", icon: Scale, title: "Fast vs Slow Autopsy", blurb: "What separates your good solves from your bad ones." },
  { href: "/consistency", icon: Sigma, title: "Consistency Lab", blurb: "Which phase your spread comes from, and what fixing it is worth." },
  { href: "/progress", icon: TrendingUp, title: "Progress Forecast", blurb: "Learning curves per phase, plateaus, and your next goal's ETA." },
  { href: "/stamina", icon: Thermometer, title: "Warm-up & Fatigue", blurb: "How long you take to warm up, and when you start to fade." },
  { href: "/xcross", icon: Target, title: "X-Cross Hunter", blurb: "Scrambles with a hidden x-cross — can you find it?" },
  { href: "/rematch", icon: Swords, title: "Solve Rematch", blurb: "Re-solve any past scramble and diff it with the original." },
  { href: "/rotations", icon: Rotate3d, title: "Rotation Audit", blurb: "Which slots make you rotate, and what it costs (gyro)." },
  { href: "/auf", icon: RefreshCcw, title: "AUF Audit", blurb: "Time and turns lost adjusting the last layer." },
  { href: "/blindcross", icon: EyeClosed, title: "Blind Cross", blurb: "Inspect, close your eyes, solve the cross — graded turn by turn." },
  { href: "/blindspots", icon: Crosshair, title: "F2L Blind Spots", blurb: "Which pair situations your lookahead can't see." },
  { href: "/pacer", icon: Gauge, title: "Split Pacer", blurb: "Hear ahead / behind at every milestone of a solve." },
  { href: "/gym", icon: Dumbbell, title: "Alg Gym", blurb: "OLL/PLL drills set up on your cube, timed and checked." },
  { href: "/tempo", icon: Metronome, title: "Tempo Trainer", blurb: "Solve to a metronome — every turn scored on the beat." },
  { href: "/bld", icon: Stethoscope, title: "BLD Doctor", blurb: "Blindfolded attempts, and exactly why a DNF happened." },
  { href: "/inspection", icon: Eye, title: "Inspection Grade", blurb: "Your inspection graded from how the cross came out." },
  { href: "/satnav", icon: Navigation, title: "Solve Sat-Nav", blurb: "Turn-by-turn directions that recalculate when you go off-route." },
  { href: "/timemachine", icon: History, title: "Time Machine", blurb: "Rewind your physical cube to any moment since you connected." },
  { href: "/algid", icon: Fingerprint, title: "Alg Identifier", blurb: "Do any sequence — find out exactly what it is." },
  { href: "/reel", icon: Clapperboard, title: "Solve Reel", blurb: "Turn a solve into a shareable video." },
  { href: "/xray", icon: ScanLine, title: "Solve X-Ray", blurb: "F2L flow, last-slot oracle, alg microscope, neutrality." },
] as const;

/** Every gesture's handler just confirms it was recognized — the Lab is for building the muscle memory, not for acting on it. */
const PRACTICE_HANDLERS = Object.fromEntries(
  GESTURE_BINDINGS.map((b) => [b.action, () => `${b.label} ✓`]),
) as Record<GestureAction, () => string>;

/**
 * The Smart Cube Lab: everything that only exists because the cube itself
 * is a sensor. The live gyro twin and its calibration, a practice pad for
 * cube gestures, and two whole-history reports — Mistake Radar (the solver)
 * and Cube Health (the hardware).
 */
export default function LabPage() {
  const connected = useSmartCubeStore((s) => s.connected);
  const connecting = useSmartCubeStore((s) => s.connecting);
  const supported = useSmartCubeStore((s) => s.supported);
  const gyroActive = useSmartCubeStore((s) => s.gyroActive);
  const deviceName = useSmartCubeStore((s) => s.deviceName);
  const connect = useSmartCubeStore((s) => s.connect);
  const allSolves = useSessionStore((s) => s.allSolves);
  const gesturesOn = useSettingsStore((s) => s.cubeGestures);
  const setGesturesOn = useSettingsStore((s) => s.setCubeGestures);
  const [calibrating, setCalibrating] = useState(false);
  const toast = useCubeGestures(PRACTICE_HANDLERS);

  const health = useMemo(
    () =>
      buildCubeHealthReport(
        allSolves
          .filter((s) => s.reconstruction && s.moveTimestamps)
          .map((s) => ({ date: s.date, reconstruction: s.reconstruction!, moveTimestamps: s.moveTimestamps! })),
      ),
    [allSolves],
  );

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>

        <div className="flex w-full max-w-xl flex-col gap-3 pb-10">
          <div className="flex items-center gap-2 px-1">
            <FlaskConical size={16} className="text-accent" />
            <h1 className="text-lg font-semibold text-foreground">Smart Cube Lab</h1>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="card flex flex-col gap-1 rounded-xl p-3 transition-colors hover:bg-bg-panel-2/60"
              >
                <tool.icon size={18} className="text-accent" />
                <span className="text-xs font-semibold text-foreground">{tool.title}</span>
                <span className="text-[10px] leading-snug text-muted-2">{tool.blurb}</span>
              </Link>
            ))}
          </div>

          <Section
            icon={<Compass size={15} className="text-accent" />}
            title="Gyro Twin"
            subtitle="A live 3D copy of the cube in your hands — stickers and orientation. Whole-cube rotations are named as they happen and written into your reconstructions, and every solve's recap maps which sides you actually looked at during inspection."
          >
            {!connected ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <GyroTwin size={90} showControls={false} />
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={connecting || !supported}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-50"
                >
                  {connecting ? <Loader2 size={14} className="animate-spin" /> : <Bluetooth size={14} />}
                  {supported ? (connecting ? "Connecting…" : "Connect smart cube") : "Web Bluetooth unavailable"}
                </button>
                <p className="max-w-xs text-center text-[11px] text-muted-2">
                  Connect it solved, held yellow top and green front — that grip is the gyro&apos;s home.
                </p>
              </div>
            ) : calibrating ? (
              <div className="flex flex-col items-center gap-4 py-2">
                <GyroTwin size={80} showControls={false} />
                <GyroCalibration onClose={() => setCalibrating(false)} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <GyroTwin size={110} />
                <p className="text-[11px] text-muted-2">{deviceName}</p>
                {gyroActive ? (
                  <button
                    type="button"
                    onClick={() => setCalibrating(true)}
                    className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Calibrate gyro axes
                  </button>
                ) : (
                  <p className="max-w-xs text-center text-[11px] text-muted-2">
                    This cube isn&apos;t streaming orientation. Gyro needs a GAN Gen2+ or MoYu AI cube — stickers still mirror live.
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section
            icon={<Hand size={15} className="text-accent" />}
            title="Cube Gestures"
            subtitle="Spin one face four times quickly (a full 360°, so the cube is untouched) to control the app hands-free between solves."
          >
            <label className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2">
              <span className="text-xs font-medium text-foreground">Enable gestures on the timer</span>
              <button
                type="button"
                role="switch"
                aria-checked={gesturesOn}
                onClick={() => setGesturesOn(!gesturesOn)}
                className={cn("relative h-5 w-9 rounded-full transition-colors", gesturesOn ? "bg-accent" : "bg-border")}
              >
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", gesturesOn ? "left-[18px]" : "left-0.5")} />
              </button>
            </label>
            <GestureLegend />
            <p className="text-center text-[11px] text-muted-2">
              {connected ? (gesturesOn ? "Try one now — it lights up below." : "Turn gestures on to practice them here.") : "Connect a cube to practice."}
            </p>
            <GestureToast toast={toast} />
          </Section>

          <Section
            icon={<Radar size={15} className="text-accent" />}
            title="Mistake Radar"
            subtitle="Every smart-cube solve replayed move by move: knocked-out pairs, broken crosses, extra OLL/PLL looks, and wasted turns — priced in seconds."
          >
            <MistakeHistory solves={allSolves} />
          </Section>

          <Section
            icon={<HeartPulse size={15} className="text-accent" />}
            title="Cube Health"
            subtitle="Diagnostics for the hardware itself, per physical face: overshoot catches, drag mid-flurry, and wear over time — with what to adjust."
          >
            <CubeHealthPanel report={health} />
          </Section>
        </div>
      </div>
    </>
  );
}
