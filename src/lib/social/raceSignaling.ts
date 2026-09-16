import { getSupabaseClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/supabase/withTimeout";

/**
 * Turns race connection setup from "copy this giant blob of text to your
 * opponent somehow" into a short code you say out loud or type once —
 * Kahoot/Jackbox-style. Supabase is only ever a mailbox for the WebRTC
 * offer/answer here: it never sees a scramble, a time, a move, or anything
 * about the race itself, which still goes directly browser-to-browser over
 * the data channel exactly as before. Available whenever the app's
 * Supabase project is configured (see isSupabaseConfigured) — RaceMode
 * falls back to the manual code-paste flow otherwise.
 */

const CODE_ALPHABET = "23456789ACDEFGHJKMNPQRTUVWXY"; // no 0/O/1/I/B/L/S/Z — avoids characters easy to mishear or mistype
const CODE_LENGTH = 5;
const ROOM_MAX_AGE_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

/** Publishes the host's offer under a fresh short code, retrying on the vanishingly rare collision with another still-live room. Returns null if Supabase isn't reachable — callers fall back to the manual flow. */
export async function createRaceRoom(offer: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await withTimeout(supabase.from("race_rooms").insert({ code, offer })).catch((e) => ({ error: e }));
    if (!error) return code;
  }
  return null;
}

/** The joiner's lookup: the offer waiting under this code, or null if it doesn't exist or has aged out (someone hosted, nobody joined, they moved on). */
export async function fetchRaceRoomOffer(code: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await withTimeout(
    supabase.from("race_rooms").select("offer, created_at").eq("code", code.trim().toUpperCase()).maybeSingle(),
  ).catch(() => ({ data: null }));
  if (!data) return null;
  if (Date.now() - new Date(data.created_at as string).getTime() > ROOM_MAX_AGE_MS) return null;
  return data.offer as string;
}

/** The joiner hands their answer back through the same room the instant they've generated it. */
export async function submitRaceRoomAnswer(code: string, answer: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await withTimeout(supabase.from("race_rooms").update({ answer }).eq("code", code.trim().toUpperCase())).catch(() => {});
}

/**
 * The host's side of the wait: polls (not Realtime — this is a one-shot,
 * usually-few-seconds wait, and plain polling needs no extra Supabase
 * config) until an answer shows up in the room, or `signal` aborts. Returns
 * the answer, or null if aborted or nothing arrived within
 * ROOM_MAX_AGE_MS.
 */
export async function waitForRaceRoomAnswer(code: string, signal: AbortSignal): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const deadline = Date.now() + ROOM_MAX_AGE_MS;
  while (!signal.aborted && Date.now() < deadline) {
    const { data } = await withTimeout(
      supabase.from("race_rooms").select("answer").eq("code", code).maybeSingle(),
    ).catch(() => ({ data: null }));
    if (data?.answer) return data.answer as string;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return null;
}

/** Best-effort cleanup once the host has actually connected — a room left behind just ages out and is harmless (never reused, never read after that), so failures here are silently ignored. */
export async function deleteRaceRoom(code: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await withTimeout(supabase.from("race_rooms").delete().eq("code", code)).catch(() => {});
}
