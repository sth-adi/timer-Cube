"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Minus, Plus, Route } from "lucide-react";
import { AnalyticsShell, useSolveMetrics } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useJourneyStore } from "@/lib/store/journeyStore";
import { MIN_SOLVES, planGoal } from "@/lib/analysis/goalPlanner";
import { WEEK, assignFocus, currentLevelMs, reviewJourney, weekPlans, type Focus, type Journey, type JourneyReview, type WeekStatus } from "@/lib/journey/journey";
import type { Solve } from "@/types";
import { cn } from "@/lib/utils/cn";

const s2 = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const wallNow = () => Date.now();
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const DRILLS: Record<Focus, { href: string; label: string }[]> = {
  Cross: [
    { href: "/blindcross", label: "Blind Cross" },
    { href: "/xcross", label: "X-Cross Hunter" },
    { href: "/crosscolor", label: "Cross Color Advisor" },
  ],
  F2L: [
    { href: "/blindspots", label: "F2L Pause Map" },
    { href: "/mistakes", label: "Mistake Drills" },
    { href: "/satnav", label: "Sat-Nav" },
  ],
  OLL: [
    { href: "/gym", label: "Alg Gym" },
    { href: "/algspeed", label: "Alg Speed Check" },
    { href: "/myalgs", label: "My Algs" },
  ],
  PLL: [
    { href: "/gym", label: "Alg Gym" },
    { href: "/algspeed", label: "Alg Speed Check" },
    { href: "/auf", label: "AUF Audit" },
  ],
  Consistency: [
    { href: "/consistency", label: "Consistency Lab" },
    { href: "/tilt", label: "Tilt Meter" },
    { href: "/comp", label: "Comp Sim" },
  ],
  Consolidate: [
    { href: "/comp", label: "Comp Sim" },
    { href: "/pacer", label: "Split Pacer" },
    { href: "/consistency", label: "Consistency Lab" },
  ],
};

const FOCUS_BLURB: Record<Focus, string> = {
  Cross: "Plan the whole cross in inspection and execute it without a pause.",
  F2L: "Your biggest budget cut is in F2L — fewer pauses between pairs, fewer wasted turns.",
  OLL: "Faster recognition and cleaner execution of the OLLs you see most.",
  PLL: "Recognise from two sides and trim the AUFs.",
  Consistency: "Fewer bad solves: the average drops when the tail does.",
  Consolidate: "Hold the gains under pressure — full rounds, no new technique this week.",
};

const STATUS: Record<WeekStatus, { label: string; tone: string }> = {
  ahead: { label: "ahead", tone: "bg-success/15 text-success" },
  "on-track": { label: "on track", tone: "bg-accent-soft text-accent" },
  behind: { label: "behind", tone: "bg-danger/15 text-danger" },
  missed: { label: "too few solves", tone: "bg-bg-panel-2 text-muted-2" },
  current: { label: "this week", tone: "bg-accent text-accent-fg" },
  upcoming: { label: "", tone: "" },
};

function useThreeByThree(): Solve[] {
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  return useMemo(() => {
    const ids = new Set(sessions.filter((x) => x.event === "333").map((x) => x.id));
    return allSolves.filter((s) => ids.has(s.sessionId));
  }, [allSolves, sessions]);
}

function Stepper({ value, label, onMinus, onPlus }: { value: string; label: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onMinus} aria-label={`Less ${label}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-panel-2 text-foreground">
          <Minus size={14} />
        </button>
        <p className="min-w-[4.5rem] text-center text-xl font-bold tabular-nums text-foreground">{value}</p>
        <button type="button" onClick={onPlus} aria-label={`More ${label}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-panel-2 text-foreground">
          <Plus size={14} />
        </button>
      </div>
      <p className="text-[10px] text-muted-2">{label}</p>
    </div>
  );
}

/** Checkpoints (dashed), weekly averages (dots) and the trend to the deadline. */
function RoadChart({ j, review }: { j: Journey; review: JourneyReview | null }) {
  const plans = weekPlans(j);
  const W = 320;
  const H = 150;
  const pad = { l: 34, r: 10, t: 10, b: 20 };
  const actual = review?.weeks.flatMap((w, i) => (w.meanMs !== null && w.status !== "upcoming" ? [{ x: i + 1, y: w.meanMs }] : [])) ?? [];
  const ys = [j.baselineMs, j.targetMs, ...actual.map((a) => a.y), ...(review?.projectedMs ? [review.projectedMs] : [])];
  const lo = Math.min(...ys) * 0.98;
  const hi = Math.max(...ys) * 1.02;
  const X = (w: number) => pad.l + (w / j.weeks) * (W - pad.l - pad.r);
  const Y = (ms: number) => pad.t + ((hi - ms) / (hi - lo)) * (H - pad.t - pad.b);
  const planPath = [`M${X(0)},${Y(j.baselineMs)}`, ...plans.map((p, i) => `L${X(i + 1)},${Y(p.checkpointMs)}`)].join(" ");
  const last = actual[actual.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Checkpoints against your weekly averages">
      <line x1={pad.l} x2={W - pad.r} y1={Y(j.targetMs)} y2={Y(j.targetMs)} stroke="var(--color-success, #22c55e)" strokeOpacity={0.5} strokeDasharray="2 3" />
      <text x={pad.l - 4} y={Y(j.targetMs) + 3} textAnchor="end" className="fill-current text-[9px] text-success">
        {(j.targetMs / 1000).toFixed(1)}
      </text>
      <text x={pad.l - 4} y={Y(j.baselineMs) + 3} textAnchor="end" className="fill-current text-[9px] text-muted-2">
        {(j.baselineMs / 1000).toFixed(1)}
      </text>
      <path d={planPath} fill="none" stroke="currentColor" className="text-muted-2" strokeWidth={1.5} strokeDasharray="4 3" />
      {review?.projectedMs && last && !review.finished && (
        <line x1={X(last.x)} y1={Y(last.y)} x2={X(j.weeks)} y2={Y(review.projectedMs)} stroke="currentColor" className={review.onPace ? "text-success" : "text-warning"} strokeWidth={1.5} strokeDasharray="1 3" />
      )}
      {actual.length > 0 && (
        <polyline points={[`${X(0)},${Y(j.baselineMs)}`, ...actual.map((a) => `${X(a.x)},${Y(a.y)}`)].join(" ")} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2} />
      )}
      {actual.map((a) => (
        <circle key={a.x} cx={X(a.x)} cy={Y(a.y)} r={3.5} className={cn("fill-current", a.y <= plans[a.x - 1].checkpointMs * 1.02 ? "text-accent" : "text-danger")} />
      ))}
      {plans.map((p, i) => (
        <text key={i} x={X(i + 1)} y={H - 6} textAnchor="middle" className="fill-current text-[9px] text-muted-2">
          {i + 1}
        </text>
      ))}
    </svg>
  );
}

function Setup({ solves }: { solves: Solve[] }) {
  const start = useJourneyStore((s) => s.start);
  const metrics = useSolveMetrics();
  const level = useMemo(() => currentLevelMs(solves), [solves]);
  const rate = useMemo(() => {
    const now = wallNow();
    const recent = solves.filter((s) => s.date >= now - 4 * WEEK).length;
    return Math.max(50, Math.round(recent / 4 / 50) * 50 || 100);
  }, [solves]);
  const [target, setTarget] = useState<number | null>(null);
  const [weeks, setWeeks] = useState(6);
  const [perWeek, setPerWeek] = useState<number | null>(null);
  if (level === null) {
    return <div className="card rounded-xl p-6 text-center text-sm text-muted">A journey starts from where you are now — do at least 12 solves on a 3x3 session first.</div>;
  }
  const targetMs = target ?? Math.max(1000, (Math.ceil(level / 1000) - 2) * 1000);
  const solvesPerWeek = perWeek ?? rate;
  const plan = metrics.length >= MIN_SOLVES ? planGoal(metrics, targetMs) : null;
  const focus = assignFocus(weeks, plan?.phases ?? []);
  const draft: Journey = { createdAt: wallNow(), baselineMs: level, targetMs, weeks, solvesPerWeek, focus };
  const perWeekDrop = (level - targetMs) / weeks;

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-4 rounded-xl p-4">
        <p className="text-center text-[11px] text-muted">
          You&apos;re averaging <span className="font-semibold text-foreground">{s2(level)}</span> right now (last 50 solves, extremes dropped).
        </p>
        <div className="grid grid-cols-1 gap-3">
          <Stepper value={`${(targetMs / 1000).toFixed(1)}s`} label="target average" onMinus={() => setTarget(Math.max(1000, targetMs - 500))} onPlus={() => setTarget(Math.min(level - 100, targetMs + 500))} />
          <div className="grid grid-cols-2 gap-2">
            <Stepper value={`${weeks} wk`} label="deadline" onMinus={() => setWeeks(Math.max(2, weeks - 1))} onPlus={() => setWeeks(Math.min(16, weeks + 1))} />
            <Stepper value={`${solvesPerWeek}`} label="solves a week" onMinus={() => setPerWeek(Math.max(25, solvesPerWeek - 25))} onPlus={() => setPerWeek(Math.min(1000, solvesPerWeek + 25))} />
          </div>
        </div>
        <p className={cn("text-center text-[11px]", perWeekDrop > level * 0.03 ? "text-warning" : "text-muted")}>
          {perWeekDrop > level * 0.03
            ? `That's ${s2(perWeekDrop)} a week — steep. Most cubers manage 1–2% a week; consider more weeks.`
            : `About ${s2(perWeekDrop)} a week on average, more at the start.`}
        </p>
      </div>

      <div className="card flex flex-col gap-2 rounded-xl p-4">
        <SectionTitle>The road</SectionTitle>
        <RoadChart j={draft} review={null} />
        <div className="flex flex-col gap-1">
          {weekPlans(draft).map((p) => (
            <p key={p.index} className="flex items-center justify-between text-[11px]">
              <span className="text-muted">
                Week {p.index + 1} · <span className="font-medium text-foreground">{p.focus}</span>
              </span>
              <span className="tabular-nums text-muted-2">{s2(p.checkpointMs)}</span>
            </p>
          ))}
        </div>
        <p className="text-[10px] text-muted-2">
          {plan ? "Focus weeks follow the Goal Planner's budget: the phases asked to give the most time get the most weeks." : "Weekly focus goes by phase once you have 20 smart-cube solves; until then it's consistency."}
        </p>
      </div>

      <button type="button" onClick={() => start({ ...draft, createdAt: wallNow() })} className="rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg">
        Start the journey
      </button>
    </div>
  );
}

function Progress({ j, solves }: { j: Journey; solves: Solve[] }) {
  const end = useJourneyStore((s) => s.end);
  const [now] = useState(wallNow);
  const review = useMemo(() => reviewJourney(j, solves, now), [j, solves, now]);
  const [confirm, setConfirm] = useState(false);
  const thisWeek = review.weeks[review.current];

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2 rounded-xl p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
          {s2(j.baselineMs)} → {s2(j.targetMs)} · {j.weeks} weeks from {day(j.createdAt)}
        </p>
        <p className="text-sm font-semibold leading-snug text-foreground">{review.headline}</p>
        {review.advice.map((a) => (
          <p key={a} className="text-[11px] text-muted">
            {a}
          </p>
        ))}
        <RoadChart j={j} review={review} />
        <p className="text-[10px] text-muted-2">
          Dashed: the checkpoints. Solid: your weekly average (extremes dropped).{review.projectedMs !== null && !review.finished ? ` Dotted: the trend, reaching ${s2(review.projectedMs)} at the deadline.` : ""}
        </p>
      </div>

      {thisWeek && (
        <div className="card flex flex-col gap-2 rounded-xl p-4 ring-1 ring-accent/40">
          <p className="text-[10px] font-medium uppercase tracking-wide text-accent">This week · {thisWeek.plan.focus}</p>
          <p className="text-[12px] text-foreground">{FOCUS_BLURB[thisWeek.plan.focus]}</p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-bg-panel-2 py-1.5">
              <p className="text-base font-bold tabular-nums text-foreground">{s2(thisWeek.plan.checkpointMs)}</p>
              <p className="text-[10px] text-muted-2">checkpoint {day(thisWeek.plan.end)}</p>
            </div>
            <div className="rounded-lg bg-bg-panel-2 py-1.5">
              <p className="text-base font-bold tabular-nums text-foreground">
                {thisWeek.solves}/{j.solvesPerWeek}
              </p>
              <p className="text-[10px] text-muted-2">solves{thisWeek.meanMs !== null ? ` · ${s2(thisWeek.meanMs)} so far` : ""}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {DRILLS[thisWeek.plan.focus].map((d) => (
              <Link key={d.href} href={d.href} className="flex items-center justify-between rounded-lg bg-bg-panel-2 px-3 py-2 text-[12px] font-medium text-foreground hover:text-accent">
                {d.label} <ChevronRight size={13} className="text-muted-2" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card flex flex-col gap-1.5 rounded-xl p-4">
        <SectionTitle>Every week</SectionTitle>
        {review.weeks.map((w) => (
          <div key={w.plan.index} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", w.status === "current" && "bg-bg-panel-2")}>
            <span className="w-12 shrink-0 text-[11px] font-semibold text-foreground">Wk {w.plan.index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{w.plan.focus}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-2">
              {w.meanMs !== null && w.status !== "upcoming" ? `${s2(w.meanMs)} / ` : ""}
              {s2(w.plan.checkpointMs)}
            </span>
            {STATUS[w.status].label && <span className={cn("w-[5.5rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold", STATUS[w.status].tone)}>{STATUS[w.status].label}</span>}
          </div>
        ))}
      </div>

      {confirm ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const finalMs = [...review.weeks].reverse().find((w) => w.meanMs !== null && w.status !== "upcoming")?.meanMs ?? null;
              end({ endedAt: wallNow(), finalMs, reached: review.reached });
            }}
            className="flex-1 rounded-full bg-danger px-4 py-2 text-xs font-semibold text-white"
          >
            End it
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="flex-1 rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-semibold text-foreground">
            Keep going
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="self-center text-[11px] text-muted-2 underline-offset-2 hover:underline">
          {review.finished || review.reached ? "Finish and plan the next one" : "End this journey"}
        </button>
      )}
    </div>
  );
}

/**
 * Training Journey: a target and a deadline turned into a week-by-week road
 * — checkpoints, a focus and drills for each week, and a running verdict
 * from your real solves on whether you're on pace.
 */
export default function JourneyPage() {
  const journey = useJourneyStore((s) => s.journey);
  const past = useJourneyStore((s) => s.past);
  const solves = useThreeByThree();

  return (
    <AnalyticsShell icon={<Route size={17} className="text-accent" />} title="Training Journey" subtitle="A goal and a deadline, turned into a week-by-week road you can check yourself against.">
      {journey ? <Progress j={journey} solves={solves} /> : <Setup solves={solves} />}
      {past.length > 0 && (
        <div className="card flex flex-col gap-1 rounded-xl p-4">
          <SectionTitle>Past journeys</SectionTitle>
          {[...past].reverse().map((p) => (
            <p key={p.createdAt} className="flex items-center justify-between text-[11px]">
              <span className="text-muted">
                {day(p.createdAt)} · {s2(p.baselineMs)} → {s2(p.targetMs)}
              </span>
              <span className={cn("font-semibold", p.reached ? "text-success" : "text-muted-2")}>{p.reached ? "reached" : p.finalMs ? `ended at ${s2(p.finalMs)}` : "ended"}</span>
            </p>
          ))}
        </div>
      )}
    </AnalyticsShell>
  );
}
