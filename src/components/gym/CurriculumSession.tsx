"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bluetooth, CheckCircle2, Crosshair, Eye, ListChecks, Navigation, Play, ScanEye, SkipForward, Square, Trophy, Waves } from "lucide-react";
import { AlgGymTrainer } from "./AlgGymTrainer";
import { RecognitionTrainer } from "@/components/algorithms/RecognitionTrainer";
import { TrainerView } from "@/components/trainer/TrainerView";
import { CrossDrill } from "@/components/trainer/CrossDrill";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useGymStore } from "@/lib/store/gymStore";
import { useTrainerStore } from "@/lib/store/trainerStore";
import { analyzeAlgSpeed } from "@/lib/analysis/algSpeed";
import { analyzeF2lConsistency } from "@/lib/analysis/f2lConsistency";
import { analyzeLookahead } from "@/lib/analysis/lookahead";
import { solveCases } from "@/lib/analysis/caseHistory";
import { metricsFor } from "@/lib/analytics/solveMetrics";
import { planCurriculum, type Block, type BlockKind } from "@/lib/gym/curriculum";
import { cn } from "@/lib/utils/cn";

const ICON: Record<BlockKind, typeof Bluetooth> = { gym: Bluetooth, recognize: ScanEye, f2l: Waves, cross: Crosshair, lookahead: Eye };
const WHERE: Record<BlockKind, string> = { gym: "Alg Gym, on your cube", recognize: "Recognition flashcards", f2l: "F2L trainer", cross: "Cross drill", lookahead: "Sat-Nav coach mode" };
const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

interface BlockResult {
  reps: number;
  hits: number;
  ms: number;
}

function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/**
 * The adaptive curriculum: plans one practice session across the Gym,
 * recognition, F2L, cross and lookahead — each block sized by what that
 * weakness costs your real solves — and runs it block by block, with the
 * right trainer embedded for each.
 */
export function CurriculumSession() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const gym = useGymStore((s) => s.stats);
  const setTrainerMode = useTrainerStore((s) => s.setMode);
  const [minutes, setMinutes] = useState(20);

  // Analyses over every saved solve: computed once per history change, not per block.
  const history = useMemo(() => {
    const analyzable = allSolves.filter((s) => s.reconstruction && s.moveTimestamps && s.penalty !== "dnf");
    return {
      alg: analyzeAlgSpeed(allSolves),
      occurrences: analyzable.flatMap(solveCases),
      solves: analyzable.length,
      f2l: analyzeF2lConsistency(allSolves),
      look: analyzeLookahead(allSolves),
      metrics: metricsFor(allSolves),
    };
  }, [allSolves]);
  const preview = useMemo(() => planCurriculum({ ...history, gym, minutes }), [history, gym, minutes]);

  const [plan, setPlan] = useState<Block[] | null>(null);
  const [index, setIndex] = useState(0);
  const [blockStart, setBlockStart] = useState(0);
  const [results, setResults] = useState<BlockResult[]>([]);
  const running = plan !== null && index < plan.length;
  const now = useTick(running);

  const begin = (i: number, p: Block[]) => {
    setIndex(i);
    setBlockStart(Date.now());
    if (p[i]?.kind === "f2l") void setTrainerMode("f2l");
  };
  const start = () => {
    setPlan(preview);
    setResults(preview.map(() => ({ reps: 0, hits: 0, ms: 0 })));
    begin(0, preview);
  };
  const next = () => {
    if (!plan) return;
    setResults((r) => r.map((x, i) => (i === index ? { ...x, ms: Date.now() - blockStart } : x)));
    begin(index + 1, plan);
  };
  const onAttempt = (ok: boolean) => setResults((r) => r.map((x, i) => (i === index ? { ...x, reps: x.reps + 1, hits: x.hits + (ok ? 1 : 0) } : x)));

  if (plan && index >= plan.length) {
    const total = results.reduce((a, r) => a + r.ms, 0);
    const reps = results.reduce((a, r) => a + r.reps, 0);
    const hits = results.reduce((a, r) => a + r.hits, 0);
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="card flex flex-col items-center gap-2 rounded-xl p-5 text-center">
          <Trophy size={28} className="text-accent" />
          <p className="text-lg font-bold text-foreground">Session done</p>
          <p className="text-xs text-muted">
            {Math.round(total / 60000)} min across {plan.length} blocks{reps ? ` · ${hits}/${reps} gym reps clean` : ""}.
          </p>
        </div>
        {plan.map((b, i) => (
          <p key={b.id} className="flex items-start gap-2 px-1 text-xs text-foreground">
            <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" />
            <span>
              {b.title} — {Math.max(1, Math.round(results[i].ms / 60000))} min
              {results[i].reps ? `, ${results[i].hits}/${results[i].reps} clean` : ""}
            </span>
          </p>
        ))}
        <button type="button" onClick={() => setPlan(null)} className="self-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-fg">
          Plan another session
        </button>
      </div>
    );
  }

  if (running && plan) {
    const block = plan[index];
    const res = results[index];
    const elapsed = now - blockStart;
    const timeUp = elapsed >= block.minutes * 60000;
    const repsDone = block.reps !== undefined && res.reps >= block.reps;
    const Icon = ICON[block.kind];
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <div className="card flex w-full max-w-md flex-col gap-2 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Icon size={14} className="text-accent" /> {index + 1}/{plan.length} · {block.title}
            </p>
            <button type="button" onClick={() => setIndex(plan.length)} className="text-muted-2 hover:text-danger" aria-label="End session">
              <Square size={13} />
            </button>
          </div>
          <p className="text-[11px] text-muted">{block.reason}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-panel-2">
            <div className={cn("h-full rounded-full transition-all", timeUp ? "bg-success" : "bg-accent")} style={{ width: `${Math.min(100, (elapsed / (block.minutes * 60000)) * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-2">
            <span>
              {Math.floor(elapsed / 60000)}:{String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")} / {block.minutes}:00
              {block.reps !== undefined && ` · ${res.reps}/${block.reps} reps · ${res.hits} clean`}
            </span>
            <button
              type="button"
              onClick={next}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 font-semibold",
                timeUp || repsDone ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted",
              )}
            >
              {index + 1 < plan.length ? "Next block" : "Finish"} <SkipForward size={11} />
            </button>
          </div>
          {(timeUp || repsDone) && <p className="text-center text-xs font-semibold text-success">Block done — move on when you&apos;re ready.</p>}
        </div>

        {block.kind === "gym" && (
          <div className="w-full max-w-md">
            <AlgGymTrainer key={block.id} focus={block.cases?.length ? block.cases : undefined} onAttempt={onAttempt} />
          </div>
        )}
        {block.kind === "recognize" && <RecognitionTrainer key={block.id} focus={block.cases} />}
        {block.kind === "f2l" && <TrainerView key={block.id} />}
        {block.kind === "cross" && <CrossDrill key={block.id} />}
        {block.kind === "lookahead" && (
          <div className="card flex w-full max-w-md flex-col items-center gap-2 rounded-xl p-5 text-center">
            <Navigation size={22} className="text-accent" />
            <p className="text-sm font-semibold text-foreground">Solve at a calm, steady pace — never stop</p>
            <p className="text-xs text-muted">
              The Sat-Nav&apos;s coach mode hides the route unless you stall, so every pause is visible. Aim to find the next pair while the current one
              is still going in.
            </p>
            <Link href="/satnav" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
              Open Sat-Nav
            </Link>
          </div>
        )}
      </div>
    );
  }

  const planned = preview.reduce((a, b) => a + b.msPerSolve, 0);
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ListChecks size={15} className="text-accent" /> Today&apos;s session
        </p>
        <div className="flex overflow-hidden rounded-full bg-bg-panel-2 text-xs">
          {[10, 20, 30].map((m) => (
            <button key={m} type="button" onClick={() => setMinutes(m)} className={cn("px-3 py-1.5 font-medium", minutes === m ? "bg-accent-soft text-accent" : "text-muted")}>
              {m} min
            </button>
          ))}
        </div>
      </div>
      {planned > 0 && (
        <p className="px-1 text-[11px] text-muted">
          Planned from your solves: these blocks target about {secs(planned)} a solve, each given time in proportion to what it&apos;s worth.
        </p>
      )}
      {preview.map((b, i) => {
        const Icon = ICON[b.kind];
        return (
          <div key={b.id} className="card flex gap-3 rounded-xl p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Icon size={15} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  {i + 1}. {b.title}
                </p>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-accent">{b.minutes} min</span>
              </div>
              <p className="text-[11px] text-muted">{b.reason}</p>
              <p className="text-[10px] text-muted-2">
                {WHERE[b.kind]}
                {b.reps ? ` · ${b.reps} reps` : ""}
                {b.msPerSolve > 0 ? ` · worth ~${secs(b.msPerSolve)}/solve` : ""}
              </p>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={start} className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg">
        <Play size={14} /> Start session
      </button>
    </div>
  );
}
