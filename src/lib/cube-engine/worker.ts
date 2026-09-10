/// <reference lib="webworker" />
import { ensureSolverReady, generateScramble333, normalizeAlg } from "./engine";
import { solveCrossOptimal } from "../solvers/cross";
import { solveCFOP } from "../solvers/cfop";
import { buildTrainerState, type TrainerMode } from "../solvers/trainerState";
import { analyzeSolve, type AnalyzeInput, type AnalyzeResult } from "../analysis/analyze";
import { gradeCrossAttempt, type CrossDrillInput, type CrossDrillOutcome } from "../analysis/crossDrill";
import { computeCorrectiveMoves } from "../analysis/scrambleVerify";

export type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "scramble" }
  | { id: number; type: "solveCross"; scramble: string }
  | { id: number; type: "solveCFOP"; scramble: string }
  | { id: number; type: "trainerState"; mode: TrainerMode }
  | { id: number; type: "analyze"; input: AnalyzeInput }
  | { id: number; type: "gradeCross"; input: CrossDrillInput }
  | { id: number; type: "correctiveMoves"; scramble: string; actualFacelets: string };

export type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "scramble"; scramble: string }
  | { id: number; type: "solveCross"; moves: string[] }
  | { id: number; type: "solveCFOP"; solution: ReturnType<typeof solveCFOP> }
  | { id: number; type: "trainerState"; setupAlg: string }
  | { id: number; type: "analyze"; result: AnalyzeResult }
  | { id: number; type: "gradeCross"; result: CrossDrillOutcome }
  | { id: number; type: "correctiveMoves"; moves: string[] }
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
      case "trainerState": {
        const { setupAlg } = buildTrainerState(msg.mode);
        ctx.postMessage({ id: msg.id, type: "trainerState", setupAlg } satisfies WorkerResponse);
        break;
      }
      case "gradeCross": {
        const result = gradeCrossAttempt(msg.input);
        ctx.postMessage({ id: msg.id, type: "gradeCross", result } satisfies WorkerResponse);
        break;
      }
      case "analyze": {
        // Several IDA* searches per solve — easily a second or two, so it runs
        // here rather than freezing the timer on the main thread.
        const result = analyzeSolve(msg.input);
        ctx.postMessage({ id: msg.id, type: "analyze", result } satisfies WorkerResponse);
        break;
      }
      case "correctiveMoves": {
        const moves = computeCorrectiveMoves(msg.scramble, msg.actualFacelets);
        ctx.postMessage({ id: msg.id, type: "correctiveMoves", moves } satisfies WorkerResponse);
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
