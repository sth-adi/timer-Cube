"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Timer as TimerIcon, Music, FlaskConical, ScanLine, Clapperboard } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { SolveList } from "@/components/sessions/SolveList";
import { eventTagsPresent, normalSolves, solvesForEvent } from "@/lib/stats/stats";
import {
  filterAndSort,
  hasFilter,
  presentCases,
  solveSummary,
  type SolveFilter,
  type SolveSort,
} from "@/lib/analysis/solveFilter";
import { CROSS_FACE_COLOR, type CrossFace } from "@/lib/smartcube/crossFrame";
import { formatTime } from "@/lib/utils/time";
import { EVENT_TAGS, solveFinalMs, type EventTag } from "@/types";
import { cn } from "@/lib/utils/cn";

/**
 * The solve history's own page — split out of the timer shell's sidebar,
 * which used to hold every solve from every event tag in one tall scroller
 * regardless of which kind of solve you actually wanted to look at. Tabbed
 * by event the same way StatsPanel already splits its numbers, so "Solves"
 * and "Stats" stay filtered the same way as each other.
 */
export default function SolvesPage() {
  const rawSolves = useSessionStore((s) => s.solves);
  const [selected, setSelected] = useState<EventTag | null>(null);
  const presentTags = useMemo(() => eventTagsPresent(rawSolves), [rawSolves]);

  const solves = useMemo(
    () => (selected ? solvesForEvent(rawSolves, selected) : normalSolves(rawSolves)),
    [rawSolves, selected],
  );
  const [filter, setFilter] = useState<SolveFilter>({});
  const [sort, setSort] = useState<SolveSort>("recent");
  const cases = useMemo(() => presentCases(solves), [solves]);
  const smart = cases.crosses.length > 0;
  const view = useMemo(() => filterAndSort(solves, filter, sort), [solves, filter, sort]);
  const filtered = hasFilter(filter);
  const matchSummary = useMemo(() => {
    if (!filtered) return null;
    const finals = view.map(solveFinalMs).filter((x): x is number => x !== null);
    const step = filter.pll ? 3 : filter.oll ? 2 : null;
    const stepTimes =
      step === null ? [] : view.map((s) => solveSummary(s)?.steps[step]).filter((x): x is number => x !== undefined);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
      n: view.length,
      mean: mean(finals),
      step: step === null ? null : { label: step === 3 ? "PLL" : "OLL", mean: mean(stepTimes) },
    };
  }, [filtered, view, filter]);

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-3 pb-8">
          <div className="flex items-center justify-between px-1">
            <h1 className="text-lg font-semibold text-foreground">Solves</h1>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Link
                href="/xray"
                className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/80"
              >
                <ScanLine size={13} />
                X-Ray
              </Link>
              <Link
                href="/reel"
                className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/80"
              >
                <Clapperboard size={13} />
                Reel
              </Link>
              <Link
                href="/lab"
                className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/80"
              >
                <FlaskConical size={13} />
                Lab
              </Link>
              <Link
                href="/rhythm"
                className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/80"
              >
                <Music size={13} />
                Rhythm
              </Link>
            </div>
          </div>

          {presentTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-pressed={selected === null}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  selected === null ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                Normal
              </button>
              {presentTags.map((tag) => {
                const meta = EVENT_TAGS.find((t) => t.id === tag)!;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelected(tag)}
                    aria-pressed={selected === tag}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      selected === tag ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                    )}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}

          {smart && (
            <div className="flex flex-wrap items-center gap-1.5 px-1" aria-label="Filter and sort solves">
              <PillSelect label="Sort" value={sort} onChange={(v) => setSort(v as SolveSort)} options={SORTS} />
              {cases.crosses.length > 1 && (
                <PillSelect
                  label="Cross"
                  value={filter.cross ?? ""}
                  onChange={(v) =>
                    setFilter((f) => ({
                      ...f,
                      cross: (v || null) as CrossFace | null,
                    }))
                  }
                  options={[
                    { value: "", label: "Any cross" },
                    ...cases.crosses.map((c) => ({
                      value: c,
                      label: `${CROSS_FACE_COLOR[c]} cross`,
                    })),
                  ]}
                />
              )}
              {cases.oll.length > 0 && (
                <PillSelect
                  label="OLL"
                  value={filter.oll ?? ""}
                  onChange={(v) => setFilter((f) => ({ ...f, oll: v || null }))}
                  options={[{ value: "", label: "Any OLL" }, ...cases.oll.map((c) => ({ value: c, label: c }))]}
                />
              )}
              {cases.pll.length > 0 && (
                <PillSelect
                  label="PLL"
                  value={filter.pll ?? ""}
                  onChange={(v) => setFilter((f) => ({ ...f, pll: v || null }))}
                  options={[{ value: "", label: "Any PLL" }, ...cases.pll.map((c) => ({ value: c, label: c }))]}
                />
              )}
              <button
                type="button"
                onClick={() => setFilter((f) => ({ ...f, twoLook: !f.twoLook }))}
                aria-pressed={!!filter.twoLook}
                title="Solves where a step's algorithm took more than one look"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filter.twoLook ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                Two-look
              </button>
              {filtered && (
                <button
                  type="button"
                  onClick={() => setFilter({})}
                  className="rounded-full px-2 py-1.5 text-xs font-medium text-muted-2 hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {matchSummary && (
            <p className="px-1 text-xs text-muted">
              {matchSummary.n} solve{matchSummary.n === 1 ? "" : "s"}
              {matchSummary.mean !== null && <> · mean {formatTime(matchSummary.mean)}</>}
              {matchSummary.step?.mean != null && (
                <>
                  {" "}
                  · {matchSummary.step.label} mean {formatTime(matchSummary.step.mean)}
                </>
              )}
            </p>
          )}

          <div className="card rounded-xl p-3">
            <SolveList solves={solves} view={smart && (filtered || sort !== "recent") ? view : undefined} />
          </div>
        </div>
      </div>
    </>
  );
}

const SORTS: { value: SolveSort; label: string }[] = [
  { value: "recent", label: "Newest first" },
  { value: "fastest", label: "Fastest" },
  { value: "slowest", label: "Slowest" },
  { value: "cross", label: "Slowest cross" },
  { value: "f2l", label: "Slowest F2L" },
  { value: "oll", label: "Slowest OLL" },
  { value: "pll", label: "Slowest PLL" },
];

/** A native select dressed as one of the page's pills — the phone's own picker on mobile. */
function PillSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== "" && value !== "recent";
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "max-w-[11rem] appearance-none truncate rounded-full border-0 px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-accent",
        active ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
