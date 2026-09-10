"use client";

import type { WorkerRequest, WorkerResponse } from "./worker";
import type { CFOPSolution } from "../solvers/cfop";
import type { TrainerMode } from "../solvers/trainerState";
import type { AnalyzeInput, AnalyzeResult } from "../analysis/analyze";
import type { CrossDrillInput, CrossDrillOutcome } from "../analysis/crossDrill";

type Pending = {
  resolve: (value: WorkerResponse) => void;
  reject: (err: Error) => void;
};

class CubeEngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private readyPromise: Promise<void> | null = null;

  private getWorker(): Worker {
    if (!this.worker) {
      const worker = new Worker(new URL("./worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const res = e.data;
        const p = this.pending.get(res.id);
        if (!p) return;
        this.pending.delete(res.id);
        if (res.type === "error") p.reject(new Error(res.message));
        else p.resolve(res);
      };
      // A worker that fails to load, or dies mid-task, never sends a reply —
      // so without this every caller waits forever and the UI sits on a
      // spinner with nothing to show and no way to retry. Fail the in-flight
      // work loudly and drop the worker so the next call builds a fresh one.
      const abort = (message: string) => {
        for (const [, pending] of this.pending) pending.reject(new Error(message));
        this.pending.clear();
        this.worker = null;
        this.readyPromise = null;
      };
      worker.onerror = (e: ErrorEvent) => {
        abort(e.message || "The cube engine worker failed to start.");
      };
      worker.onmessageerror = () => {
        abort("The cube engine worker sent a message that couldn't be read.");
      };
      this.worker = worker;
    }
    return this.worker;
  }

  private send<T extends Omit<WorkerRequest, "id">>(req: T): Promise<WorkerResponse> {
    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  /** Warms up the solver's pruning tables ahead of time (~1-2s), off the main thread. */
  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.send({ type: "init" }).then(() => undefined);
    }
    return this.readyPromise;
  }

  async generateScramble(): Promise<string> {
    const res = await this.send({ type: "scramble" });
    if (res.type !== "scramble") throw new Error("Unexpected worker response");
    return res.scramble;
  }

  async solveCross(scramble: string): Promise<string[]> {
    const res = await this.send({ type: "solveCross", scramble });
    if (res.type !== "solveCross") throw new Error("Unexpected worker response");
    return res.moves;
  }

  async solveCFOP(scramble: string): Promise<CFOPSolution> {
    const res = await this.send({ type: "solveCFOP", scramble });
    if (res.type !== "solveCFOP") throw new Error("Unexpected worker response");
    return res.solution;
  }

  async analyzeSolve(input: AnalyzeInput): Promise<AnalyzeResult> {
    const res = await this.send({ type: "analyze", input });
    if (res.type !== "analyze") throw new Error("Unexpected worker response");
    return res.result;
  }

  async gradeCross(input: CrossDrillInput): Promise<CrossDrillOutcome> {
    const res = await this.send({ type: "gradeCross", input });
    if (res.type !== "gradeCross") throw new Error("Unexpected worker response");
    return res.result;
  }

  async generateTrainerState(mode: TrainerMode): Promise<string> {
    const res = await this.send({ type: "trainerState", mode });
    if (res.type !== "trainerState") throw new Error("Unexpected worker response");
    return res.setupAlg;
  }

  async computeCorrectiveMoves(scramble: string, actualFacelets: string): Promise<string[]> {
    const res = await this.send({ type: "correctiveMoves", scramble, actualFacelets });
    if (res.type !== "correctiveMoves") throw new Error("Unexpected worker response");
    return res.moves;
  }
}

let instance: CubeEngineClient | null = null;
export function getCubeEngineClient(): CubeEngineClient {
  if (!instance) instance = new CubeEngineClient();
  return instance;
}
