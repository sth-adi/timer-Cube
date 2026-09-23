/// <reference lib="webworker" />
import { xraySolve, type SolveXray, type XrayRequest } from "./solveXray";

export type XrayWorkerRequest = { id: number; req: XrayRequest };
export type XrayWorkerResponse = { id: number; ok: true; result: SolveXray } | { id: number; ok: false; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/**
 * The X-Ray's own worker: the Last Slot Oracle's search can take a good
 * fraction of a second, and a history scan runs the rest over dozens of
 * solves — none of which should ever stall a frame of the UI.
 */
ctx.onmessage = (e: MessageEvent<XrayWorkerRequest>) => {
  const { id, req } = e.data;
  try {
    ctx.postMessage({ id, ok: true, result: xraySolve(req) } satisfies XrayWorkerResponse);
  } catch (err) {
    ctx.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) } satisfies XrayWorkerResponse);
  }
};
