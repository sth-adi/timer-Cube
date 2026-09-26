"use client";

import type { XrayWorkerRequest, XrayWorkerResponse } from "./worker";
import type { SolveXray, XrayRequest } from "./solveXray";
import type { Solve } from "@/types";
import { analysisFrame } from "@/lib/smartcube/crossFrame";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: SolveXray) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL("./worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<XrayWorkerResponse>) => {
      const res = e.data;
      const p = pending.get(res.id);
      if (!p) return;
      pending.delete(res.id);
      if (res.ok) p.resolve(res.result);
      else p.reject(new Error(res.message));
    };
    w.onerror = (e) => {
      for (const [, p] of pending) p.reject(new Error(e.message || "X-Ray worker failed"));
      pending.clear();
      worker = null;
    };
    worker = w;
  }
  return worker;
}

/** Runs the X-Ray for one solve off the main thread. */
export function runXray(req: XrayRequest): Promise<SolveXray> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, req } satisfies XrayWorkerRequest);
  });
}

/** A saved solve the X-Ray can read: a smart-cube capture with scramble, moves, and per-move timing. */
export function isXrayable(s: Solve): boolean {
  return !!s.scramble && !!s.reconstruction && !!s.moveTimestamps && s.moveTimestamps.length > 0;
}

export function xrayRequestFor(solve: Solve, extra: Partial<XrayRequest> = {}): XrayRequest {
  const s = analysisFrame(solve);
  return {
    scramble: s.scramble,
    moves: s.reconstruction!.split(/\s+/).filter(Boolean),
    timesMs: s.moveTimestamps!,
    date: s.date,
    ...extra,
  };
}
