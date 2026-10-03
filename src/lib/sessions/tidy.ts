import type { Session, Solve } from "@/types";

export interface TidyPlan {
  /** Fold `from` into `into` (same name and event); `from` is removed afterwards. */
  merges: { from: string; into: string }[];
  /** Sessions with no solves, to be deleted. */
  removeEmpty: string[];
  /** One line saying what will happen — empty when there's nothing to do. */
  summary: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What "Tidy up" would do: sessions with the same name and event are merged into the one with the
 * most solves, and empty sessions are removed — but at least one session always survives, and the
 * open one is kept when it does (merging it away or removing it lands on the merge target / the
 * session with the most solves, see mergeSessions and removeSession).
 */
export function planTidy(sessions: readonly Session[], solves: readonly Solve[], activeId: string | null): TidyPlan {
  const counts = new Map<string, number>();
  for (const s of solves) counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1);
  const countOf = (id: string) => counts.get(id) ?? 0;

  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = JSON.stringify([s.name.trim(), s.event]);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const merges: TidyPlan["merges"] = [];
  const mergePhrases: string[] = [];
  const folded = new Set<string>();
  for (const group of groups.values()) {
    const withSolves = group.filter((s) => countOf(s.id) > 0);
    if (withSolves.length < 2) continue;
    // Most solves wins; on a tie the open session, then the earlier one in the list.
    let target = withSolves[0];
    for (const s of withSolves) {
      const better = countOf(s.id) > countOf(target.id) || (countOf(s.id) === countOf(target.id) && s.id === activeId);
      if (better) target = s;
    }
    const sources = withSolves.filter((s) => s.id !== target.id);
    for (const s of sources) {
      merges.push({ from: s.id, into: target.id });
      folded.add(s.id);
    }
    mergePhrases.push(`Merge ${plural(sources.length, "session")} named ${target.name} into the one with ${plural(countOf(target.id), "solve")}`);
  }

  // Everything with no solves goes (merge targets and sources have some), unless that would leave nothing.
  let removeEmpty = sessions.filter((s) => countOf(s.id) === 0).map((s) => s.id);
  if (removeEmpty.length === sessions.length - folded.size && removeEmpty.length > 0) {
    const keep = removeEmpty.includes(activeId ?? "") ? activeId : removeEmpty[0];
    removeEmpty = removeEmpty.filter((id) => id !== keep);
  }

  const parts = [...mergePhrases];
  if (removeEmpty.length > 0) parts.push(`remove ${plural(removeEmpty.length, "empty session")}`);
  const summary = parts.join(" · ");
  return { merges, removeEmpty, summary };
}
