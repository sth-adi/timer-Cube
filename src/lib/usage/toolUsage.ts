/**
 * Which screens actually get used — counted on this device only, in
 * localStorage, and never sent anywhere. The Lab reads it to put the tools
 * you use first; it's also the evidence for deciding which specialist
 * screens earn their place.
 */

export interface ToolUse {
  count: number;
  /** ms since epoch. */
  last: number;
}
export type ToolUsage = Record<string, ToolUse>;

export const TOOL_USAGE_KEY = "cube.toolUsage.v1";

/** "/luck" and "/luck/anything" both count as "/luck"; "/" isn't a tool. */
export function toolKey(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0];
  return first ? `/${first}` : null;
}

export function parseUsage(raw: string | null): ToolUsage {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ToolUsage = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const u = v as Partial<ToolUse>;
      if (typeof u?.count === "number" && typeof u?.last === "number") out[k] = { count: u.count, last: u.last };
    }
    return out;
  } catch {
    return {};
  }
}

export function withVisit(usage: ToolUsage, key: string, now: number): ToolUsage {
  return { ...usage, [key]: { count: (usage[key]?.count ?? 0) + 1, last: now } };
}

/** Tools you've opened (most-opened first, then most recent), and the ones you haven't. */
export function rankTools<T extends { href: string }>(tools: readonly T[], usage: ToolUsage): { used: T[]; unused: T[] } {
  const used = tools
    .filter((t) => usage[t.href])
    .sort((a, b) => usage[b.href].count - usage[a.href].count || usage[b.href].last - usage[a.href].last);
  return { used, unused: tools.filter((t) => !usage[t.href]) };
}

// ---- browser storage (every access guarded: private windows and blocked storage throw) ----

const listeners = new Set<() => void>();
/** One visit per arrival: a repeat of the same screen within this window (a re-mount, dev strict mode) isn't counted again. */
const REPEAT_WINDOW_MS = 2000;
let lastVisit: { key: string; at: number } | null = null;

export function readUsageRaw(): string | null {
  try {
    return window.localStorage.getItem(TOOL_USAGE_KEY);
  } catch {
    return null;
  }
}

export function recordToolVisit(pathname: string): void {
  const key = toolKey(pathname);
  if (!key) return;
  const now = Date.now();
  if (lastVisit && lastVisit.key === key && now - lastVisit.at < REPEAT_WINDOW_MS) return;
  lastVisit = { key, at: now };
  try {
    const next = withVisit(parseUsage(readUsageRaw()), key, now);
    window.localStorage.setItem(TOOL_USAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  for (const l of listeners) l();
}

export function subscribeUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
