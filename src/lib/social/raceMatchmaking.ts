import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/supabase/withTimeout";

/**
 * Auto-pairing on top of the same race_rooms-style mailbox idea (see
 * raceSignaling.ts) — instead of one side generating a code the other has
 * to be told, both sides drop their offer into a shared queue and either
 * claim someone else's or wait to be claimed. Still just a WebRTC
 * offer/answer handoff; the race itself never touches Supabase.
 *
 * A claim is race-safe without any server-side function: the update that
 * claims a waiting row is conditioned on `status = eq('waiting')`, and
 * Postgres serializes concurrent updates to the same row, so at most one
 * of two simultaneous claimants ever affects it.
 *
 * That alone isn't quite enough, though — two racers whose local offer
 * setup (ICE gathering, scramble generation) happens to take about the
 * same time can both find the queue empty, both post their own offer, and
 * then just wait for each other forever (nobody left playing "claimer").
 * findMatch() keeps retrying the claim step while it waits on its own
 * posted row, and breaks the remaining symmetric case — both sides posted,
 * both now see each other and could claim — with a tie-break: a row only
 * claims another row with a *lexicographically smaller* id. For any pair,
 * that's true for exactly one of the two, so exactly one side ends up
 * claiming and the other waits, never both.
 */

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const QUEUE_MAX_AGE_MS = 45 * 1000;
const POLL_INTERVAL_MS = 1200;
const MATCH_TIMEOUT_MS = 25 * 1000;

function randomId(): string {
  let id = "";
  for (let i = 0; i < 16; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return id;
}

interface ClaimedMatch {
  offer: string;
  rowId: string;
}

/** Looks for the oldest still-fresh waiting entry with a smaller id than ours (see the tie-break note above) and tries to claim it. Null if nothing qualifies or every candidate was claimed out from under us. */
async function tryClaim(myId: string): Promise<ClaimedMatch | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await withTimeout(
    supabase.from("race_queue").select("id, offer, created_at").eq("status", "waiting").order("created_at", { ascending: true }).limit(10),
  ).catch(() => ({ data: null }));
  if (!data) return null;
  const candidates = data.filter(
    (r) => (r.id as string) < myId && Date.now() - new Date(r.created_at as string).getTime() < QUEUE_MAX_AGE_MS,
  );
  for (const row of candidates) {
    const { data: claimedRows } = await withTimeout(
      supabase.from("race_queue").update({ status: "matched", matched_with: myId }).eq("id", row.id).eq("status", "waiting").select(),
    ).catch(() => ({ data: null }));
    if (claimedRows && claimedRows.length > 0) return { offer: row.offer as string, rowId: row.id as string };
  }
  return null;
}

export type MatchOutcome =
  | { role: "answerer"; offer: string; rowId: string }
  | { role: "offerer"; answer: string };

/**
 * The full matchmaking attempt for one side: try to claim someone already
 * waiting; if that fails, post our own offer and keep polling — on every
 * poll tick, both checking whether someone claimed *us* and retrying the
 * claim ourselves, so two racers who post at nearly the same moment still
 * resolve into one claimer and one claimee instead of both waiting
 * forever. Returns null if Supabase is unreachable, aborted, or nothing
 * panned out within MATCH_TIMEOUT_MS — callers fall back to a room code.
 *
 * `getOffer` is a callback rather than a plain string because building a
 * local offer means creating an RTCPeerConnection and gathering ICE
 * candidates (up to several seconds) — work worth doing only if the initial
 * claim attempt below comes up empty, so it's deferred until we actually
 * need to post something.
 */
export async function findMatch(getOffer: () => Promise<string>, signal: AbortSignal): Promise<MatchOutcome | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const myId = randomId();

  const claimed = await tryClaim(myId);
  if (claimed) return { role: "answerer", offer: claimed.offer, rowId: claimed.rowId };
  if (signal.aborted) return null;

  const myOffer = await getOffer();
  if (signal.aborted) return null;
  // A single transient network hiccup here shouldn't sink the whole
  // attempt — retry a couple of times before giving up and falling back to
  // a room code, mirroring createRaceRoom's resilience in raceSignaling.ts.
  let posted = false;
  for (let attempt = 0; attempt < 3 && !posted && !signal.aborted; attempt++) {
    const { error } = await withTimeout(supabase.from("race_queue").insert({ id: myId, offer: myOffer, status: "waiting" })).catch((e) => ({
      error: e,
    }));
    posted = !error;
  }
  if (!posted) return null;

  const deadline = Date.now() + MATCH_TIMEOUT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    const { data: mine } = await withTimeout(
      supabase.from("race_queue").select("answer").eq("id", myId).maybeSingle(),
    ).catch(() => ({ data: null }));
    if (mine?.answer) {
      void leaveQueue(myId);
      return { role: "offerer", answer: mine.answer as string };
    }

    const claimedNow = await tryClaim(myId);
    if (claimedNow) {
      void leaveQueue(myId);
      return { role: "answerer", offer: claimedNow.offer, rowId: claimedNow.rowId };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  void leaveQueue(myId);
  return null;
}

/** Once we've claimed someone's waiting offer and generated our own answer, hand it back through the same row. */
export async function submitMatchAnswer(rowId: string, answer: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await withTimeout(supabase.from("race_queue").update({ answer }).eq("id", rowId)).catch(() => {});
}

/** Best-effort cleanup — a leftover row just ages out (QUEUE_MAX_AGE_MS makes it invisible to tryClaim) and is otherwise harmless. */
export async function leaveQueue(rowId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await withTimeout(supabase.from("race_queue").delete().eq("id", rowId)).catch(() => {});
}
