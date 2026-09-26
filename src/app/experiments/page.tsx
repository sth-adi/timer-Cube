"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useExperimentStore, type Experiment, type ExperimentKind } from "@/lib/store/experimentStore";
import { analyzeExperiment, type ExperimentResult } from "@/lib/analysis/experiment";
import { PHASES, metricsFor } from "@/lib/analytics/solveMetrics";
import { normalSolves } from "@/lib/stats/stats";
import { solveFinalMs, type Solve } from "@/types";
import { cn } from "@/lib/utils/cn";

/** Solves counted on each side of a change — enough for a verdict, recent enough to be about the change. */
const WINDOW = 100;
const KINDS: { id: ExperimentKind; label: string }[] = [
  { id: "cube", label: "Cube" },
  { id: "setup", label: "Tension / lube" },
  { id: "algorithm", label: "Algorithm" },
  { id: "method", label: "Method" },
  { id: "routine", label: "Routine" },
  { id: "other", label: "Other" },
];
const s2 = (ms: number) => (ms / 1000).toFixed(2);

function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

/** A number line from the CI's low to high end, with zero marked — the "how big, plausibly" picture. */
function CiBar({ r }: { r: ExperimentResult }) {
  const lo = Math.min(r.ci[0], 0);
  const hi = Math.max(r.ci[1], 0);
  const span = Math.max(1, hi - lo) * 1.2;
  const pad = (span - (hi - lo)) / 2;
  const x = (v: number) => ((v - lo + pad) / span) * 100;
  const tone = r.verdict === "better" ? "bg-success" : r.verdict === "worse" ? "bg-danger" : "bg-muted-2";
  return (
    <div className="relative h-6 w-full">
      <div className="absolute top-3 h-px w-full bg-border" />
      <div className={cn("absolute top-2 h-2 rounded-full opacity-70", tone)} style={{ left: `${x(r.ci[0])}%`, width: `${Math.max(1, x(r.ci[1]) - x(r.ci[0]))}%` }} />
      <div className="absolute top-1 h-4 w-0.5 bg-foreground" style={{ left: `${x(r.diffMs)}%` }} />
      <div className="absolute top-0 h-6 w-px bg-accent" style={{ left: `${x(0)}%` }} />
      <span className="absolute -bottom-3 text-[9px] text-accent" style={{ left: `${x(0)}%`, transform: "translateX(-50%)" }}>
        no change
      </span>
    </div>
  );
}

function sides(solves: readonly Solve[], at: number) {
  const sorted = [...solves].sort((a, b) => a.date - b.date);
  const before = sorted.filter((s) => s.date < at).slice(-WINDOW);
  const after = sorted.filter((s) => s.date >= at).slice(0, WINDOW);
  return { before, after };
}

const finals = (xs: readonly Solve[]) => xs.map(solveFinalMs).filter((x): x is number => x !== null);

function ExperimentCard({ e, solves, onRemove }: { e: Experiment; solves: readonly Solve[]; onRemove: () => void }) {
  const { overall, phases, nBefore, nAfter } = useMemo(() => {
    const { before, after } = sides(solves, e.at);
    const overall = analyzeExperiment(finals(before), finals(after));
    // Per phase, only from smart-cube solves on both sides.
    const mb = metricsFor(before);
    const ma = metricsFor(after);
    const phases = PHASES.map((name, k) => ({
      name,
      r: analyzeExperiment(
        mb.map((m) => m.phases[k]),
        ma.map((m) => m.phases[k]),
      ),
    })).filter((p) => p.r && p.r.verdict !== "too-few");
    return { overall, phases, nBefore: before.length, nAfter: after.length };
  }, [e.at, solves]);

  const badge =
    !overall || overall.verdict === "too-few"
      ? { text: "Collecting", cls: "bg-bg-panel-2 text-muted" }
      : overall.verdict === "better"
        ? { text: "Helped", cls: "bg-success/15 text-success" }
        : overall.verdict === "worse"
          ? { text: "Hurt", cls: "bg-danger/10 text-danger" }
          : { text: "No clear effect", cls: "bg-bg-panel-2 text-foreground" };

  return (
    <div className="card flex flex-col gap-2.5 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-bold text-foreground">{e.name}</p>
          <p className="text-[10px] text-muted-2">
            {KINDS.find((k) => k.id === e.kind)?.label} · {new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ·{" "}
            {nBefore} before / {nAfter} after
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>{badge.text}</span>
          <button type="button" onClick={onRemove} className="text-muted-2 hover:text-danger" aria-label="Delete experiment">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {e.note && <p className="text-[11px] italic text-muted">{e.note}</p>}
      {overall ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["Before", s2(overall.meanBefore)],
                ["After", s2(overall.meanAfter)],
                ["Change", `${overall.diffMs < 0 ? "−" : "+"}${s2(Math.abs(overall.diffMs))}`],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className="rounded-lg bg-bg-panel-2 px-2 py-1.5">
                <p className="text-sm font-bold tabular-nums text-foreground">{v}</p>
                <p className="text-[10px] text-muted-2">{l}</p>
              </div>
            ))}
          </div>
          {overall.verdict !== "too-few" && <CiBar r={overall} />}
          <p className="pt-1 text-[11px] leading-relaxed text-foreground">{overall.headline}</p>
          {phases.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border pt-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Where it changed (smart-cube solves)</p>
              {phases.map(({ name, r }) => (
                <div key={name} className="flex items-center gap-2 text-[11px]">
                  <span className="w-10 text-muted">{name}</span>
                  <span className={cn("w-16 font-semibold tabular-nums", r!.verdict === "better" ? "text-success" : r!.verdict === "worse" ? "text-danger" : "text-muted")}>
                    {r!.diffMs < 0 ? "−" : "+"}
                    {s2(Math.abs(r!.diffMs))}s
                  </span>
                  <span className="text-muted-2">{r!.verdict === "unclear" ? "not clear yet" : r!.verdict === "better" ? "clearly faster" : "clearly slower"}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted">Needs solves on both sides of the change — keep solving.</p>
      )}
    </div>
  );
}

/**
 * Experiments: log a change — a new cube, new tension, a new algorithm, a
 * new warm-up — and find out whether it actually made you faster, with a
 * real statistical test, a plausible range for the effect, a check against
 * the improvement you were already making, and a per-phase breakdown.
 */
export default function ExperimentsPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const experiments = useExperimentStore((s) => s.experiments);
  const add = useExperimentStore((s) => s.add);
  const remove = useExperimentStore((s) => s.remove);
  const solves = useMemo(() => normalSolves(allSolves), [allSolves]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ExperimentKind>("cube");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");

  const submit = () => {
    const at = when ? new Date(when).getTime() : NaN;
    if (!name.trim() || !Number.isFinite(at)) return;
    add({ id: `${at}-${name}`, name: name.trim(), kind, note: note.trim(), at });
    setOpen(false);
    setName("");
    setNote("");
  };

  return (
    <AnalyticsShell icon={<FlaskConical size={17} className="text-accent" />} title="Experiments" subtitle="Did that change actually make you faster? Log it and find out.">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setWhen(toLocalInput(new Date().setSeconds(0, 0)));
            setOpen(true);
          }}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg"
        >
          <Plus size={14} /> Log a change
        </button>
      ) : (
        <div className="card flex flex-col gap-2.5 rounded-xl p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What changed? e.g. New cube: Tornado V3" className="rounded-lg bg-bg-panel-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-2" />
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button key={k.id} type="button" onClick={() => setKind(k.id)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", kind === k.id ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-muted")}>
                {k.label}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-[11px] text-muted">
            When
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="rounded-lg bg-bg-panel-2 px-2 py-1.5 text-xs text-foreground outline-none" />
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes (optional)" className="rounded-lg bg-bg-panel-2 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-2" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-bg-panel-2 px-3 py-1.5 text-xs text-muted">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={!name.trim()} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-40">
              Start the experiment
            </button>
          </div>
          <p className="text-[10px] text-muted-2">Set the time in the past if you already made the change — your existing solves become the evidence.</p>
        </div>
      )}
      {experiments.length === 0 && !open && (
        <p className="px-1 text-center text-xs text-muted">
          Switched cubes, learned a new T-perm, started warming up? Log it here. Every solve after it becomes data, and the verdict firms up as you go.
        </p>
      )}
      {experiments.map((e) => (
        <ExperimentCard key={e.id} e={e} solves={solves} onRemove={() => remove(e.id)} />
      ))}
      <p className="px-1 text-[10px] leading-relaxed text-muted-2">
        Up to {WINDOW} solves each side of the change (normal 3x3 solves, DNFs excluded). &ldquo;Very unlikely to be luck&rdquo; means a permutation test
        gave p &lt; 0.05 and the 95% interval doesn&apos;t cross zero.
      </p>
    </AnalyticsShell>
  );
}
