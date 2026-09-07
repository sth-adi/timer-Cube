/// <reference lib="webworker" />
import { ensureSolverReady, generateScramble333, normalizeAlg } from "./engine";
import { solveCrossOptimal } from "../solvers/cross";
import { solveCFOP } from "../solvers/cfop";

export type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "scramble" }
  | { id: number; type: "solveCross"; scramble: string }
  | { id: number; type: "solveCFOP"; scramble: string };

export type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "scramble"; scramble: string }
  | { id: number; type: "solveCross"; moves: string[] }
  | { id: number; type: "solveCFOP"; solution: ReturnType<typeof solveCFOP> }
  | { id: number; type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let readyPromise: Promise<void> | null = null;
function init(): Promise<void> {
  if (!readyPromise) {
    readyPromise = new Promise((resolve) => {
      ensureSolverReady();
      resolve();
    });
  }
  return readyPromise;
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    await init();
    switch (msg.type) {
      case "init": {
        ctx.postMessage({ id: msg.id, type: "ready" } satisfies WorkerResponse);
        break;
      }
      case "scramble": {
        const scramble = generateScramble333();
        ctx.postMessage({ id: msg.id, type: "scramble", scramble } satisfies WorkerResponse);
        break;
      }
      case "solveCross": {
        const moves = solveCrossOptimal(normalizeAlg(msg.scramble));
        ctx.postMessage({ id: msg.id, type: "solveCross", moves } satisfies WorkerResponse);
        break;
      }
      case "solveCFOP": {
        const solution = solveCFOP(normalizeAlg(msg.scramble));
        ctx.postMessage({ id: msg.id, type: "solveCFOP", solution } satisfies WorkerResponse);
        break;
      }
    }
  } catch (err) {
    ctx.postMessage({
      id: msg.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
