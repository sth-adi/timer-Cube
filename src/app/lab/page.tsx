"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  BookOpen,
  Clock,
  Clover,
  Clapperboard,
  Compass,
  Crosshair,
  Dumbbell,
  EyeClosed,
  Eye,
  Binoculars,
  ChevronDown,
  ChevronRight,
  Fingerprint,
  Flag,
  Flame,
  FlaskConical,
  Gauge,
  GraduationCap,
  Hand,
  HeartPulse,
  History,
  Hourglass,
  Layers,
  Loader2,
  Medal,
  Metronome,
  Minimize2,
  Navigation,
  Palette,
  Puzzle,
  Radar,
  RefreshCcw,
  Rotate3d,
  RotateCw,
  Scale,
  Search,
  Shapes,
  Shuffle,
  Sigma,
  ScanLine,
  SlidersHorizontal,
  Snowflake,
  Stethoscope,
  Swords,
  Target,
  Thermometer,
  Timer as TimerIcon,
  TrendingUp,
  Wrench,
  X,
  Zap,
  Glasses,
  Gavel,
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
import { analyzeCoach } from "@/lib/analysis/labCoach";
import { metricsFor } from "@/lib/analytics/solveMetrics";
import { defaultTargetMs, planGoal, typicalSolveMs, MIN_SOLVES as GOAL_MIN_SOLVES } from "@/lib/analysis/goalPlanner";
import { buildProgress, MIN_SOLVES as PROGRESS_MIN_SOLVES } from "@/lib/analytics/progress";
import { cn } from "@/lib/utils/cn";
import { parseUsage, rankTools, readUsageRaw, subscribeUsage } from "@/lib/usage/toolUsage";

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

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

/**
 * Every tool below (bar Coach/Goal/Progress, which get their own hero
 * treatment — see `<Hero />`) sorts into exactly one of these, so the Lab
 * reads as six small drawers instead of one long grid. Order here is the
 * order they render in.
 */
type LabCategory = "start" | "time" | "algs" | "technique" | "drills" | "live" | "picture";

const CATEGORIES: { key: Exclude<LabCategory, "start">; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; blurb: string }[] = [
  { key: "time", icon: Clock, label: "Where time goes", blurb: "Which phase, case or moment is actually costing you." },
  { key: "algs", icon: BookOpen, label: "Algorithms & recognition", blurb: "Speed and consistency on your OLLs, PLLs and F2L cases." },
  { key: "technique", icon: Wrench, label: "Technique & turning", blurb: "How you turn — bias, economy, the handoff between pairs." },
  { key: "drills", icon: Swords, label: "Drills & challenges", blurb: "Structured practice: timed, scored, set up on your cube." },
  { key: "live", icon: Navigation, label: "Live solving aids", blurb: "Help while the timer's running, or replaying after." },
  { key: "picture", icon: Layers, label: "The big picture", blurb: "Zoomed-out views across your whole history." },
];

const TOOLS = [
  { href: "/coach", icon: GraduationCap, title: "Coach", blurb: "Where your time goes, ranked by what fixing it is worth.", category: "start" },
  { href: "/goal", icon: Flag, title: "Goal Planner", blurb: "Pick a target time — get a phase budget from your own good days.", category: "start" },
  { href: "/progress", icon: TrendingUp, title: "Progress Forecast", blurb: "Learning curves per phase, plateaus, and your next goal's ETA.", category: "start" },

  { href: "/lookahead", icon: Binoculars, title: "Lookahead Tradeoff", blurb: "Does turning F2L calmer shorten your next pause — and is it worth it?", category: "time" },
  { href: "/stalls", icon: Flame, title: "Stall Map", blurb: "A heatmap of where in each phase your pauses land.", category: "time" },
  { href: "/autopsy", icon: Scale, title: "Fast vs Slow Autopsy", blurb: "What separates your good solves from your bad ones.", category: "time" },
  { href: "/consistency", icon: Sigma, title: "Consistency Lab", blurb: "Which phase your spread comes from, and what fixing it is worth.", category: "time" },
  { href: "/stamina", icon: Thermometer, title: "Warm-up & Fatigue", blurb: "How long you take to warm up, and when you start to fade.", category: "time" },
  { href: "/rotations", icon: Rotate3d, title: "Rotation Audit", blurb: "Which slots make you rotate, and what it costs (gyro).", category: "time" },
  { href: "/auf", icon: RefreshCcw, title: "AUF Audit", blurb: "Time and turns lost adjusting the last layer.", category: "time" },
  { href: "/blindspots", icon: Crosshair, title: "F2L Pause Map", blurb: "Which hand-off between pairs stalls you — and a drill from those exact positions.", category: "time" },
  { href: "/cadence", icon: Activity, title: "Cadence", blurb: "How steady your turn-to-turn spacing is — smooth stream or stutters.", category: "time" },
  { href: "/tilt", icon: AlertTriangle, title: "Tilt Meter", blurb: "Does a mistake early in a solve bleed into the phase right after?", category: "time" },
  { href: "/momentum", icon: Zap, title: "Momentum Meter", blurb: "Do fast solves cluster together, or is every solve independent of the last?", category: "time" },
  { href: "/coldstart", icon: Snowflake, title: "Cold Start Tax", blurb: "Are your first few turns after a pause slower than your steady speed?", category: "time" },
  { href: "/bottleneck", icon: SlidersHorizontal, title: "Bottleneck Report", blurb: "Is each slow case costing you recognition time, or execution time?", category: "time" },
  { href: "/economy", icon: Minimize2, title: "Move Economy Trend", blurb: "A learning curve for your move count, not your time.", category: "time" },

  { href: "/algspeed", icon: Hourglass, title: "Alg Speed Check", blurb: "Which OLLs and PLLs are slow — a second look, a stop, or slow fingers.", category: "algs" },
  { href: "/f2lcases", icon: Puzzle, title: "F2L Case Consistency", blurb: "Your best turn count on each F2L case against your usual one.", category: "algs" },
  { href: "/cases", icon: Shapes, title: "Case History", blurb: "Every OLL, PLL and F2L case you've had — how often, and recognise vs execute.", category: "algs" },
  { href: "/gym", icon: Dumbbell, title: "Alg Gym", blurb: "OLL/PLL drills set up on your cube, timed and checked.", category: "algs" },
  { href: "/algid", icon: Fingerprint, title: "Alg Identifier", blurb: "Do any sequence — find out exactly what it is.", category: "algs" },

  { href: "/spin", icon: RotateCw, title: "Spin", blurb: "Clockwise vs counter-clockwise, and which side of each axis is slower.", category: "technique" },
  { href: "/crosscolor", icon: Palette, title: "Cross Color Advisor", blurb: "How long your cross would have been on every other color.", category: "technique" },
  { href: "/multislot", icon: Layers, title: "Multi-Slot Report", blurb: "Pairs solved together vs one at a time — and which is actually faster.", category: "technique" },

  { href: "/xcross", icon: Target, title: "X-Cross Hunter", blurb: "Scrambles with a hidden x-cross — can you find it?", category: "drills" },
  { href: "/rematch", icon: Swords, title: "Rematch & Ghost Race", blurb: "Race any real solve on its scramble — yours, a friend's, or a pasted recon.", category: "drills" },
  { href: "/comp", icon: Gavel, title: "Comp Sim", blurb: "A full competition round: judge calls, cutoff, official average, comp tax.", category: "drills" },
  { href: "/blindcross", icon: EyeClosed, title: "Blind Cross", blurb: "Inspect, close your eyes, solve the cross — graded turn by turn.", category: "drills" },
  { href: "/pacer", icon: Gauge, title: "Split Pacer", blurb: "Hear ahead / behind at every milestone of a solve.", category: "drills" },
  { href: "/tempo", icon: Metronome, title: "Tempo Trainer", blurb: "Solve to a metronome — every turn scored on the beat.", category: "drills" },
  { href: "/bld", icon: Stethoscope, title: "BLD Doctor", blurb: "Blindfolded attempts, and exactly why a DNF happened.", category: "drills" },
  { href: "/inspection", icon: Eye, title: "Inspection Grade", blurb: "Your inspection graded from how the cross came out.", category: "drills" },

  { href: "/satnav", icon: Navigation, title: "Solve Sat-Nav", blurb: "Turn-by-turn directions that recalculate when you go off-route.", category: "live" },
  { href: "/timemachine", icon: History, title: "Time Machine", blurb: "Rewind your physical cube to any moment since you connected.", category: "live" },
  { href: "/reel", icon: Clapperboard, title: "Solve Reel", blurb: "Turn a solve — or your week's best — into a video.", category: "live" },
  { href: "/ar", icon: Glasses, title: "Cube AR", blurb: "Your cube's live twin pinned onto it through the camera.", category: "live" },

  { href: "/experiments", icon: FlaskConical, title: "Experiments", blurb: "Log a change — new cube, new alg — and test whether it really helped.", category: "picture" },
  { href: "/sob", icon: Medal, title: "Sum of Best", blurb: "Your best cross, pairs, OLL and PLL added up — and your golds.", category: "picture" },
  { href: "/luck", icon: Clover, title: "Luck Meter", blurb: "How much each solve was the scramble, and your luck-free leaderboard.", category: "picture" },
  { href: "/archetypes", icon: Shapes, title: "Solve Archetypes", blurb: "The shapes your solves come in, clustered, and what each costs.", category: "picture" },
  { href: "/eventmix", icon: Shuffle, title: "Event Mix", blurb: "Every puzzle and category you do, ranked against your ordinary 3x3.", category: "picture" },
  { href: "/xray", icon: ScanLine, title: "Solve X-Ray", blurb: "F2L flow, last-slot oracle, alg microscope, neutrality.", category: "picture" },
] as const;

/** Everything but Coach/Goal/Progress — those get the hero, not a grid card. */
const GRID_TOOLS = TOOLS.filter((t): t is (typeof TOOLS)[number] & { category: Exclude<LabCategory, "start"> } => t.category !== "start");
const BY_CATEGORY = new Map(CATEGORIES.map((c) => [c.key, GRID_TOOLS.filter((t) => t.category === c.key)]));

function ToolGrid({ tools, usage }: { tools: readonly (typeof TOOLS)[number][]; usage: ReturnType<typeof parseUsage> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tools.map((tool) => (
        <Link
          key={tool.href}
          href={tool.href}
          className="card flex flex-col gap-1 rounded-xl p-3 transition-colors hover:bg-bg-panel-2/60"
        >
          <tool.icon size={18} className="text-accent" />
          <span className="text-xs font-semibold text-foreground">{tool.title}</span>
          <span className="text-[10px] leading-snug text-muted-2">{tool.blurb}</span>
          {usage[tool.href] && (
            <span className="mt-auto text-[10px] tabular-nums text-muted">
              opened {usage[tool.href].count}×
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function CategorySection({
  cat,
  open,
  onToggle,
  usage,
}: {
  cat: (typeof CATEGORIES)[number];
  open: boolean;
  onToggle: () => void;
  usage: ReturnType<typeof parseUsage>;
}) {
  const tools = BY_CATEGORY.get(cat.key) ?? [];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-panel/40">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-3 text-left">
        <div className="flex items-center gap-2.5">
          <cat.icon size={16} className="shrink-0 text-accent" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-foreground">
              {cat.label} <span className="font-normal text-muted-2">· {tools.length}</span>
            </span>
            <span className="text-[10px] text-muted-2">{cat.blurb}</span>
          </div>
        </div>
        <ChevronDown size={15} className={cn("shrink-0 text-muted-2 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border p-3 pt-3">
          <ToolGrid tools={tools} usage={usage} />
        </div>
      )}
    </div>
  );
}

/** Every gesture's handler just confirms it was recognized — the Lab is for building the muscle memory, not for acting on it. */
const PRACTICE_HANDLERS = Object.fromEntries(
  GESTURE_BINDINGS.map((b) => [b.action, () => `${b.label} ✓`]),
) as Record<GestureAction, () => string>;

/**
 * The Smart Cube Lab: everything that only exists because the cube itself
 * is a sensor. Three things answer "what do I practice today" up top
 * (Coach, Goal Planner, Progress Forecast) — everything else sorts into
 * six collapsed drawers by what it's for, so 40-odd tools don't have to be
 * scrolled past to find the one you want. Search jumps straight to any of
 * them regardless of category.
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
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Set<Exclude<LabCategory, "start">>>(() => new Set());
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const toast = useCubeGestures(PRACTICE_HANDLERS);
  // Local-only visit counts (lib/usage/toolUsage.ts): the tools you use come first.
  const usageRaw = useSyncExternalStore(subscribeUsage, readUsageRaw, () => null);
  const usage = useMemo(() => parseUsage(usageRaw), [usageRaw]);
  const { used } = useMemo(() => rankTools(GRID_TOOLS, usage), [usage]);

  const coach = useMemo(() => analyzeCoach(allSolves), [allSolves]);
  const metrics = useMemo(() => metricsFor(allSolves), [allSolves]);
  const goal = useMemo(() => {
    if (metrics.length < GOAL_MIN_SOLVES) return null;
    return planGoal(metrics, defaultTargetMs(typicalSolveMs(metrics)));
  }, [metrics]);
  const progress = useMemo(() => buildProgress(metrics), [metrics]);

  const health = useMemo(
    () =>
      buildCubeHealthReport(
        allSolves
          .filter((s) => s.reconstruction && s.moveTimestamps)
          .map((s) => ({ date: s.date, reconstruction: s.reconstruction!, moveTimestamps: s.moveTimestamps! })),
      ),
    [allSolves],
  );

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = useMemo(
    () => (searching ? TOOLS.filter((t) => t.title.toLowerCase().includes(q) || t.blurb.toLowerCase().includes(q)) : []),
    [q, searching],
  );

  const toggleCat = (key: Exclude<LabCategory, "start">) =>
    setOpenCats((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${TOOLS.length} tools…`}
              className="w-full rounded-full border border-border bg-bg-panel-2 py-2 pl-9 pr-9 text-xs text-foreground outline-none placeholder:text-muted-2 focus:border-accent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2 hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {searching ? (
            matches.length > 0 ? (
              <ToolGrid tools={matches} usage={usage} />
            ) : (
              <p className="px-1 py-6 text-center text-xs text-muted-2">No tool matches &ldquo;{query}&rdquo;.</p>
            )
          ) : (
            <>
              {coach && coach.findings.length > 0 ? (
                <div className="card flex flex-col gap-2 rounded-xl p-4">
                  <Link href="/coach" className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-accent">
                    <GraduationCap size={15} className="text-accent" />
                    Coach — start here
                  </Link>
                  <p className="text-[12px] leading-relaxed text-foreground">{coach.headline}</p>
                  <ol className="flex flex-col gap-0.5">
                    {coach.findings.slice(0, 3).map((f, i) => (
                      <li key={f.id}>
                        <Link
                          href={f.href}
                          className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[11px] transition-colors hover:bg-bg-panel-2/60"
                        >
                          <span className="truncate text-muted">
                            {i + 1}. {f.title}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-accent">{secs(f.msPerSolve)}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                  <Link href="/coach" className="flex items-center justify-end gap-1 text-[11px] font-medium text-foreground hover:text-accent">
                    Full plan <ChevronRight size={13} className="text-muted-2" />
                  </Link>
                </div>
              ) : (
                <Link href="/coach" className="card flex items-center gap-2 rounded-xl p-4 transition-colors hover:bg-bg-panel-2/60">
                  <GraduationCap size={15} className="text-accent" />
                  <p className="text-[12px] text-muted">
                    Coach — start here once you have {GOAL_MIN_SOLVES} smart-cube solves ({allSolves.length} so far).
                  </p>
                  <ChevronRight size={13} className="ml-auto shrink-0 text-muted-2" />
                </Link>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Link href="/goal" className="card flex flex-col gap-1.5 rounded-xl p-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Flag size={13} className="text-accent" /> Goal
                  </span>
                  <span className="text-[11px] leading-snug text-muted">
                    {goal ? goal.headline : `Needs ${GOAL_MIN_SOLVES} solves — ${allSolves.length} so far.`}
                  </span>
                </Link>
                <Link href="/progress" className="card flex flex-col gap-1.5 rounded-xl p-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <TrendingUp size={13} className="text-accent" /> Progress
                  </span>
                  <span className="text-[11px] leading-snug text-muted">
                    {progress ? progress.headline : `Needs ${PROGRESS_MIN_SOLVES} solves — ${allSolves.length} so far.`}
                  </span>
                </Link>
              </div>

              {used.length > 0 && (
                <>
                  <h2 className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-2">Jump back in</h2>
                  <ToolGrid tools={used.slice(0, 6)} usage={usage} />
                </>
              )}

              <h2 className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-2">Everything else</h2>
              <div className="flex flex-col gap-2">
                {CATEGORIES.map((cat) => (
                  <CategorySection key={cat.key} cat={cat} open={openCats.has(cat.key)} onToggle={() => toggleCat(cat.key)} usage={usage} />
                ))}
              </div>
              <p className="px-1 text-[10px] text-muted-2">
                Opened-tool counts are tracked on this device only, never sent anywhere.
              </p>
            </>
          )}

          <button
            type="button"
            onClick={() => setHardwareOpen((v) => !v)}
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-bg-panel/40 p-3 text-left"
          >
            <div className="flex items-center gap-2.5">
              <HeartPulse size={16} className="shrink-0 text-accent" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-foreground">Cube &amp; hardware</span>
                <span className="text-[10px] text-muted-2">Gyro twin, gesture practice, mistake radar, hardware diagnostics.</span>
              </div>
            </div>
            <ChevronDown size={15} className={cn("shrink-0 text-muted-2 transition-transform", hardwareOpen && "rotate-180")} />
          </button>

          {hardwareOpen && (
            <>
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
