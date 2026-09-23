/// <reference lib="webworker" />
import { planFromFacelets, type NavStep } from "./planner";

export type SatNavRequest = { id: number; facelets: string };
export type SatNavResponse = { id: number; ok: true; step: NavStep } | { id: number; ok: false; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Pair searches can take a few hundred ms on a hard position — never on the UI thread while someone's mid-turn. */
ctx.onmessage = (e: MessageEvent<SatNavRequest>) => {
  const { id, facelets } = e.data;
  try {
    ctx.postMessage({ id, ok: true, step: planFromFacelets(facelets) } satisfies SatNavResponse);
  } catch (err) {
    ctx.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) } satisfies SatNavResponse);
  }
};
