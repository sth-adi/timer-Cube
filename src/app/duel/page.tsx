"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, Copy, Share2, Swords, Trash2, UserPlus } from "lucide-react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { SectionTitle } from "@/components/analytics/ChartKit";
import { RadarChart } from "@/components/stats/RadarChart";
import { useSessionStore } from "@/lib/store/sessionStore";
import { useDuelStore } from "@/lib/store/duelStore";
import { buildDuelCard, compareCards, decodeCard, encodeCard, type DuelCard, type DuelRow } from "@/lib/duel/duel";
import { cn } from "@/lib/utils/cn";

const wallNow = () => Date.now();

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const readHash = () => window.location.hash;

function fmt(row: DuelRow, v: number | null): string {
  if (v === null) return "—";
  if (row.unit === "s") return `${(v / 1000).toFixed(2)}s`;
  if (row.unit === "tps") return v.toFixed(1);
  return v.toLocaleString();
}

function Versus({ me, them, saved }: { me: DuelCard; them: DuelCard; saved: boolean }) {
  const keep = useDuelStore((s) => s.keep);
  const report = useMemo(() => compareCards(me, them), [me, them]);
  const shared = me.axes.filter((a) => them.axes.some((b) => b.label === a.label));

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col items-center gap-2 rounded-xl p-4 text-center">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
          {me.name} <span className="text-accent">●</span> vs <span className="text-warning">●</span> {them.name}
        </p>
        <p className="text-sm font-semibold leading-snug text-foreground">{report.headline}</p>
        {shared.length >= 3 && <RadarChart axes={shared} rival={them.axes} className="h-60 w-full max-w-xs" />}
        <p className="text-[11px] text-muted">
          <span className="font-semibold text-accent">{me.trait || "You"}</span> meets <span className="font-semibold text-warning">{them.trait || them.name}</span>
        </p>
        <p className="text-[10px] text-muted-2">Each DNA axis is measured against its owner&apos;s own best, so the radar compares styles; the table below compares times.</p>
      </div>

      <div className="card flex flex-col gap-1 rounded-xl p-4">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1.5 text-[12px]">
          <span />
          <span className="text-right text-[10px] font-semibold uppercase text-accent">You</span>
          <span className="text-right text-[10px] font-semibold uppercase text-warning">{them.name}</span>
          {report.rows.map((r) => (
            <div key={r.label} className="contents">
              <span className="text-muted">{r.label}</span>
              <span className={cn("text-right tabular-nums", r.edge === "me" ? "font-bold text-foreground" : "text-muted")}>{fmt(r, r.mine)}</span>
              <span className={cn("text-right tabular-nums", r.edge === "them" ? "font-bold text-foreground" : "text-muted")}>{fmt(r, r.theirs)}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-2">
          Their card is from {new Date(them.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Bold wins the row; phases and turning speed come from smart-cube solves.
        </p>
      </div>

      {(report.steal.length > 0 || report.teach.length > 0) && (
        <div className="card flex flex-col gap-2 rounded-xl p-4">
          {report.steal.length > 0 && (
            <>
              <SectionTitle>What to take from {them.name}</SectionTitle>
              {report.steal.map((s) => (
                <p key={s} className="text-[12px] leading-snug text-foreground">
                  {s}
                </p>
              ))}
            </>
          )}
          {report.teach.length > 0 && (
            <>
              <SectionTitle>Where you lead</SectionTitle>
              {report.teach.map((s) => (
                <p key={s} className="text-[12px] leading-snug text-muted">
                  {s}
                </p>
              ))}
            </>
          )}
        </div>
      )}

      {!saved && (
        <button type="button" onClick={() => keep(them)} className="flex items-center justify-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2.5 text-xs font-semibold text-foreground">
          <UserPlus size={13} /> Keep {them.name} as a rival
        </button>
      )}
    </div>
  );
}

/**
 * DNA Duel: your Cube DNA and real numbers in a link. Send it; when a
 * friend opens it they see both fingerprints on one radar, the numbers
 * side by side, and what each of you should take from the other.
 */
export default function DuelPage() {
  const allSolves = useSessionStore((s) => s.allSolves);
  const sessions = useSessionStore((s) => s.sessions);
  const name = useDuelStore((s) => s.name);
  const setName = useDuelStore((s) => s.setName);
  const rivals = useDuelStore((s) => s.rivals);
  const drop = useDuelStore((s) => s.drop);
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const [pasted, setPasted] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mine = useMemo(() => {
    const ids = new Set(sessions.filter((x) => x.event === "333").map((x) => x.id));
    return buildDuelCard(
      allSolves.filter((s) => ids.has(s.sessionId)),
      name,
      wallNow(),
    );
  }, [allSolves, sessions, name]);

  const fromLink = useMemo(() => (hash.includes("c=") ? decodeCard(hash) : null), [hash]);
  const fromPaste = useMemo(() => (pasted.trim() ? decodeCard(pasted) : null), [pasted]);
  const them = fromPaste ?? fromLink ?? rivals.find((r) => r.name === picked) ?? null;
  const badLink = hash.includes("c=") && !fromLink;

  const link = mine && typeof window !== "undefined" ? `${window.location.origin}/duel#c=${encodeCard(mine)}` : "";
  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "DNA Duel", text: `${mine!.name} challenges you to a DNA Duel`, url: link });
        return;
      } catch {
        // Cancelled or unsupported — fall through to copying.
      }
    }
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AnalyticsShell icon={<Swords size={17} className="text-accent" />} title="DNA Duel" subtitle="Your Cube DNA against a friend's — one link, no account.">
      {!mine ? (
        <div className="card rounded-xl p-6 text-center text-sm text-muted">Your duel card needs at least 12 solves on a 3x3 session.</div>
      ) : (
        <div className="card flex flex-col gap-3 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              placeholder="Your name on the card"
              className="min-w-0 flex-1 rounded-lg bg-bg-panel-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-2"
            />
            <button type="button" onClick={() => void share()} className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-fg">
              {copied ? <Check size={13} /> : <Share2 size={13} />} {copied ? "Copied" : "Send my card"}
            </button>
          </div>
          <p className="text-[11px] text-muted">
            {(mine.averageMs / 1000).toFixed(2)}s average · {mine.count.toLocaleString()} solves · {mine.trait}. The link carries these numbers and your DNA shape — nothing else.
          </p>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(link)} className="flex items-center gap-1 self-start text-[10px] text-muted-2 hover:text-foreground">
            <Copy size={10} /> copy the link
          </button>
        </div>
      )}

      {badLink && <p className="px-1 text-[12px] text-danger">That duel link is broken or incomplete — ask for it again.</p>}

      {mine && them ? (
        <Versus me={mine} them={them} saved={rivals.some((r) => r.name === them.name && r.at === them.at)} />
      ) : (
        mine && (
          <div className="card flex flex-col gap-2 rounded-xl p-4">
            <SectionTitle>Open a friend&apos;s card</SectionTitle>
            <input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Paste their duel link"
              className="rounded-lg bg-bg-panel-2 px-3 py-2 text-[12px] text-foreground outline-none placeholder:text-muted-2"
            />
            {pasted.trim() && !fromPaste && <p className="text-[11px] text-danger">That isn&apos;t a duel link.</p>}
          </div>
        )
      )}

      {rivals.length > 0 && (
        <div className="card flex flex-col gap-1 rounded-xl p-4">
          <SectionTitle>Rivals</SectionTitle>
          {[...rivals].reverse().map((r) => (
            <div key={r.name} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPasted("");
                  setPicked(r.name);
                  if (window.location.hash) history.replaceState(null, "", window.location.pathname);
                  window.dispatchEvent(new HashChangeEvent("hashchange"));
                }}
                className={cn("flex min-w-0 flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-bg-panel-2", them?.name === r.name && "bg-bg-panel-2")}
              >
                <span className="truncate font-medium text-foreground">{r.name}</span>
                <span className="shrink-0 tabular-nums text-muted-2">{(r.averageMs / 1000).toFixed(2)}s</span>
              </button>
              <button type="button" onClick={() => drop(r.name)} aria-label={`Remove ${r.name}`} className="shrink-0 text-muted-2 hover:text-danger">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </AnalyticsShell>
  );
}
