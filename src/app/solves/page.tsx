"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Timer as TimerIcon, ListChecks, Trash2 } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { SolveList } from "@/components/sessions/SolveList";
import { eventTagsPresent, normalSolves, solvesForEvent } from "@/lib/stats/stats";
import {
  filterAndSort,
  hasFilter,
  presentCases,
  presentCubes,
  solveSummary,
  type SolveFilter,
  type SolveSort,
} from "@/lib/analysis/solveFilter";
import { schedulePresentCases } from "@/lib/analysis/idleWarm";
import { hasBreakdown } from "@/lib/analysis/solveBreakdown";
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
  // Every smart solve's summary is worked out in idle time (once per solve — a new solve only costs itself), so a long
  // history doesn't freeze the page; the previous menus stay until the new ones land.
  const [casesNow, setCases] = useState<ReturnType<typeof presentCases> | null>(null);
  useEffect(() => schedulePresentCases(solves, setCases), [solves]);
  const cases = casesNow ?? NO_CASES;
  const cubes = useMemo(() => presentCubes(solves), [solves]);
  const nicknames = useSettingsStore((s) => s.cubeNicknames);
  // Until the first pass lands, a solve that carries turns is enough to show the filter bar (no jump when the menus fill in).
  const smart = cubes.length > 0 || (casesNow ? casesNow.crosses.length > 0 : solves.some(hasBreakdown));
  const updateSolves = useSessionStore((s) => s.updateSolves);
  const removeSolves = useSessionStore((s) => s.removeSolves);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // Stable, so the memoized solve rows aren't all re-rendered by every tick of the checkbox.
  const toggle = useCallback(
    (id: string) =>
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const view = useMemo(() => filterAndSort(solves, filter, sort), [solves, filter, sort]);
  const filtered = hasFilter(filter);
  const showView = smart && (filtered || sort !== "recent");
  // What's on screen, in order — "select all" means these, not everything behind a filter.
  const shownIds = useMemo(() => (showView ? view : [...solves].reverse()).map((s) => s.id), [showView, view, solves]);
  // A tick on a solve that has since scrolled out of the list (a filter changed) must not be acted on blind.
  const livePicked = useMemo(() => shownIds.filter((id) => picked.has(id)), [shownIds, picked]);
  const { pll: filterPll, oll: filterOll } = filter;
  const matchSummary = useMemo(() => {
    if (!filtered) return null;
    const finals = view.map(solveFinalMs).filter((x): x is number => x !== null);
    const step = filterPll ? 3 : filterOll ? 2 : null;
    const stepTimes =
      step === null ? [] : view.map((s) => solveSummary(s)?.steps[step]).filter((x): x is number => x !== undefined);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
      n: view.length,
      mean: mean(finals),
      step: step === null ? null : { label: step === 3 ? "PLL" : "OLL", mean: mean(stepTimes) },
    };
  }, [filtered, view, filterPll, filterOll]);

  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="hit-y flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} strokeWidth={1.75} className="text-accent" />
          Cube
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-3 pb-8">
          <div className="flex items-center justify-between gap-3 px-1">
            <h1 className="text-balance text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground">Solves</h1>
            <button
              type="button"
              onClick={() => {
                setSelecting((v) => !v);
                setPicked(new Set());
              }}
              aria-pressed={selecting}
              // Nothing to select on an empty history (and a selection mode already open can still be closed).
              disabled={rawSolves.length === 0 && !selecting}
              className={cn(
                "hit-y flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors active:translate-y-px disabled:opacity-40",
                selecting ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent",
              )}
              data-testid="select-toggle"
            >
              <ListChecks size={13} strokeWidth={1.75} />
              {selecting ? "Done" : "Select"}
            </button>
          </div>
          <nav aria-label="Solve tools" className="-mt-1 flex flex-wrap gap-x-4 px-1">
            {[
              ["/xray", "X-Ray"],
              ["/reel", "Reel"],
              ["/lab", "Lab"],
              ["/rhythm", "Rhythm"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="hit-y px-2 text-xs font-medium text-muted [@media(hover:hover)]:hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>

          {presentTags.length > 0 && (
            <div className="flex animate-fade-in-up flex-wrap gap-1.5 px-1 [@media(pointer:coarse)]:gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-pressed={selected === null}
                className={cn(
                  "hit-y rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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
                      "hit-y rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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
            <div className="flex animate-fade-in-up flex-wrap items-center gap-1.5 px-1 [@media(pointer:coarse)]:gap-2" aria-label="Filter and sort solves">
              <PillSelect label="Sort" value={sort} onChange={(v) => setSort(v as SolveSort)} options={SORTS} />
              {cubes.length > 0 && (
                <PillSelect
                  label="Cube"
                  value={filter.cube ?? ""}
                  onChange={(v) => setFilter((f) => ({ ...f, cube: v || null }))}
                  options={[{ value: "", label: "Any cube" }, ...cubes.map((c) => ({ value: c.id, label: nicknames[c.id] || c.name }))]}
                />
              )}
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
                  "hit-y rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter.twoLook ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                Two-look
              </button>
              <button
                type="button"
                onClick={() => setFilter((f) => ({ ...f, mistake: !f.mistake }))}
                aria-pressed={!!filter.mistake}
                title="Solves the Mistake Radar flagged, a knocked pair, a broken cross, an extra look, wasted turns"
                className={cn(
                  "hit-y rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter.mistake ? "bg-accent-soft text-accent" : "bg-bg-panel-2 text-muted hover:text-foreground",
                )}
              >
                Has a mistake
              </button>
              {filtered && (
                <button
                  type="button"
                  onClick={() => setFilter({})}
                  className="hit-y rounded-md px-2 py-1.5 text-xs font-medium text-muted-2 hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {matchSummary && (
            <p className="tabular-timer px-1 text-xs text-muted">
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

          {selecting && (
            <div className="card sticky top-2 z-20 flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-2" data-testid="bulk-bar">
              <span className="mr-1 text-xs font-medium text-foreground" data-testid="bulk-count">
                {livePicked.length} selected
              </span>
              <button type="button" onClick={() => setPicked(new Set(shownIds))} className="inline-flex items-center pointer-coarse:min-h-10 rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg-panel-2 hover:text-foreground">
                All shown ({shownIds.length})
              </button>
              <button type="button" onClick={() => setPicked(new Set())} className="inline-flex items-center pointer-coarse:min-h-10 rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg-panel-2 hover:text-foreground">
                None
              </button>
              <span className="mx-0.5 h-4 w-px bg-border" />
              {(["plus2", "dnf", "none"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={livePicked.length === 0}
                  onClick={() => void updateSolves(livePicked, { penalty: p })}
                  className="inline-flex items-center pointer-coarse:min-h-10 rounded-md px-2.5 py-1 text-xs font-medium text-foreground hover:bg-bg-panel-2 disabled:opacity-40"
                >
                  {p === "plus2" ? "+2" : p === "dnf" ? "DNF" : "Clear penalty"}
                </button>
              ))}
              <select
                aria-label="Tag selected solves"
                disabled={livePicked.length === 0}
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) void updateSolves(livePicked, { event: v === "normal" ? null : (v as EventTag) });
                }}
                className="pointer-coarse:min-h-10 rounded-md bg-bg-panel-2 px-2.5 py-1 text-[16px] font-medium text-foreground disabled:opacity-40 sm:text-xs"
              >
                <option value="">Tag as</option>
                <option value="normal">Normal</option>
                {EVENT_TAGS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={livePicked.length === 0}
                onClick={() => {
                  void removeSolves(livePicked);
                  setPicked(new Set());
                }}
                className="ml-auto flex items-center gap-1 pointer-coarse:min-h-10 rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
                data-testid="bulk-delete"
              >
                <Trash2 size={12} strokeWidth={1.75} /> Delete
              </button>
            </div>
          )}

          <div className="card rounded-xl p-2 lg:p-3">
            <SolveList solves={solves} view={showView ? view : undefined} selection={selecting ? { selected: picked, toggle } : undefined} />
          </div>
        </div>
      </div>
    </>
  );
}

const NO_CASES: ReturnType<typeof presentCases> = { oll: [], pll: [], crosses: [] };

const SORTS: { value: SolveSort; label: string }[] = [
  { value: "recent", label: "Newest first" },
  { value: "fastest", label: "Fastest" },
  { value: "slowest", label: "Slowest" },
  { value: "cross", label: "Slowest cross" },
  { value: "f2l", label: "Slowest F2L" },
  { value: "oll", label: "Slowest OLL" },
  { value: "pll", label: "Slowest PLL" },
];

/** A native select styled as one of the page's filter chips — the phone's own picker on mobile. */
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
        "max-w-[11rem] appearance-none truncate rounded-md border-0 px-3 py-1.5 text-[16px] font-medium sm:text-xs pointer-coarse:min-h-10 transition-colors focus:outline-none focus:ring-1 focus:ring-accent",
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
