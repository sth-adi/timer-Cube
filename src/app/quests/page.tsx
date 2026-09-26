"use client";

import { Check, Crown, Gift, Sparkles, Target, Zap } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { useProgression } from "@/components/quests/useProgression";
import { useQuestStore } from "@/lib/store/questStore";
import { weekStart } from "@/lib/quests/quests";
import { cn } from "@/lib/utils/cn";

function LevelRing({ level, pct }: { level: number; pct: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 110 110" className="h-28 w-28" role="img" aria-label={`Level ${level}`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--bg-panel-2)" strokeWidth="9" />
      <circle
        cx="55"
        cy="55"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="52" textAnchor="middle" className="fill-foreground text-[30px] font-black">
        {level}
      </text>
      <text x="55" y="72" textAnchor="middle" className="fill-muted-2 text-[9px] font-semibold uppercase tracking-widest">
        level
      </text>
    </svg>
  );
}

const KIND_ICON = { volume: Zap, skill: Target, stretch: Crown } as const;

/**
 * Quests & Levels: XP from everything you do (derived from your history,
 * so it never drifts), a level and title, and three quests a week built
 * from your own data — volume, your biggest weakness, and a stretch goal.
 */
export default function QuestsPage() {
  const { xp, level, quests, claimed, achievements, now } = useProgression();
  const claim = useQuestStore((s) => s.claim);
  const daysLeft = Math.max(1, Math.ceil((weekStart(now) + 7 * 864e5 - now) / 864e5));
  const next = achievements
    .filter((a) => !a.unlocked)
    .map((a) => ({
      a,
      pct:
        a.direction === "max"
          ? Math.min(1, a.target > 0 ? a.currentValue / a.target : 0)
          : Number.isFinite(a.currentValue)
            ? Math.min(1, a.target / Math.max(a.currentValue, 1))
            : 0,
    }))
    .sort((x, y) => y.pct - x.pct)
    .slice(0, 3);

  return (
    <AnalyticsShell icon={<Sparkles size={17} className="text-accent" />} title="Quests & Levels" subtitle="Everything you practise earns XP. Three new quests every Monday, aimed at you.">
      <div className="card flex items-center gap-4 rounded-xl p-4">
        <LevelRing level={level.level} pct={level.span ? level.into / level.span : 0} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-lg font-black text-foreground">{level.title}</p>
          <p className="text-xs tabular-nums text-muted">
            {xp.total.toLocaleString()} XP · {(level.span - level.into).toLocaleString()} to level {level.level + 1}
          </p>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-bg-panel-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(level.into / Math.max(1, level.span)) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-foreground">This week&apos;s quests</p>
        <p className="text-[11px] text-muted-2">
          {daysLeft} day{daysLeft === 1 ? "" : "s"} left
        </p>
      </div>
      {quests.map((q) => {
        const Icon = KIND_ICON[q.kind];
        const isClaimed = !!claimed[q.id];
        return (
          <div key={q.id} className={cn("card flex flex-col gap-2 rounded-xl p-4", q.done && !isClaimed && "ring-1 ring-accent")}>
            <div className="flex items-start gap-3">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", q.done ? "bg-success/15 text-success" : "bg-accent/15 text-accent")}>
                {q.done ? <Check size={15} /> : <Icon size={15} />}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{q.title}</p>
                  <span className="shrink-0 text-xs font-bold text-accent">+{q.xp} XP</span>
                </div>
                <p className="text-[11px] text-muted">{q.detail}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-panel-2">
                <div className={cn("h-full rounded-full", q.done ? "bg-success" : "bg-accent")} style={{ width: `${(q.progress / q.target) * 100}%` }} />
              </div>
              <span className="text-[10px] tabular-nums text-muted-2">
                {q.progress}/{q.target}
              </span>
              {q.done &&
                (isClaimed ? (
                  <span className="text-[11px] font-semibold text-success">Claimed</span>
                ) : (
                  <button type="button" onClick={() => claim(q.id, q.xp)} className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-fg">
                    <Gift size={11} /> Claim
                  </button>
                ))}
            </div>
          </div>
        );
      })}

      {next.length > 0 && (
        <div className="card flex flex-col gap-2 rounded-xl p-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Closest milestones · +150 XP each</p>
          {next.map(({ a, pct }) => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span className="text-base">{a.icon}</span>
              <span className="flex-1 truncate text-foreground">
                {a.label} <span className="text-muted-2">— {a.description}</span>
              </span>
              <span className="tabular-nums text-muted">{Math.round(pct * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="card flex flex-col gap-1 rounded-xl p-4">
        <p className="pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">Where your XP came from</p>
        {xp.parts.map((p) => (
          <div key={p.label} className="flex justify-between text-xs">
            <span className="text-muted">{p.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{p.xp.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </AnalyticsShell>
  );
}
