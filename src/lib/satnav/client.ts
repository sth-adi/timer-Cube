"use client";

import type { SatNavRequest, SatNavResponse } from "./worker";
import type { NavStep } from "./planner";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (s: NavStep) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL("./worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<SatNavResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.step);
      else p.reject(new Error(e.data.message));
    };
    w.onerror = (e) => {
      for (const [, p] of pending) p.reject(new Error(e.message || "Sat-Nav worker failed"));
      pending.clear();
      worker = null;
    };
    worker = w;
  }
  return worker;
}

/** Plans the next leg from a live facelet string, off the main thread. */
export function planNext(facelets: string): Promise<NavStep> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, facelets } satisfies SatNavRequest);
  });
}
