"use client";

import type { WorkerRequest, WorkerResponse } from "./worker";
import type { CFOPSolution } from "../solvers/cfop";

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
      this.worker = new Worker(new URL("./worker.ts", import.meta.url));
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const res = e.data;
        const p = this.pending.get(res.id);
        if (!p) return;
        this.pending.delete(res.id);
        if (res.type === "error") p.reject(new Error(res.message));
        else p.resolve(res);
      };
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
}

let instance: CubeEngineClient | null = null;
export function getCubeEngineClient(): CubeEngineClient {
  if (!instance) instance = new CubeEngineClient();
  return instance;
}
