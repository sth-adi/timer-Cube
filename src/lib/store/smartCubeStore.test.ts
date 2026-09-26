import { afterEach, describe, expect, it } from "vitest";
import { Subject } from "rxjs";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { useSmartCubeStore } from "./smartCubeStore";

/** A scripted cube behind the store's test seam: every turn goes through the real timer logic. */
async function connectSim() {
  const events$ = new Subject<unknown>();
  (globalThis as Record<string, unknown>).__smartCubeTestDriver = {
    connectSmartCube: async () => ({
      deviceName: "SimCube",
      protocol: { name: "Sim" },
      capabilities: { battery: false, gyroscope: false, facelets: false, hardware: false, reset: false },
      events$,
      disconnect: async () => {},
      sendCommand: async () => {},
    }),
  };
  useSmartCubeStore.setState({ supported: true });
  await useSmartCubeStore.getState().connect();
  let t = 1_000;
  const turn = (move: string, gapMs = 250) => {
    t += gapMs;
    events$.next({ type: "MOVE", move, timestamp: t });
  };
  return { turn };
}

afterEach(() => {
  useSmartCubeStore.getState().disconnect();
  delete (globalThis as Record<string, unknown>).__smartCubeTestDriver;
});

describe("smart-cube timer", () => {
  it("starts on the first turn, not when the cross lands", async () => {
    const solve = fullSolveOn("U");
    const { turn } = await connectSim();
    for (const m of solve.scramble.split(" ")) turn(m, 10);
    useSmartCubeStore.getState().arm();

    const [first, ...rest] = solve.moves;
    turn(first);
    const firstAt = useSmartCubeStore.getState().moves[0].timeStampMs;
    expect(useSmartCubeStore.getState().recording).toBe(true);
    expect(useSmartCubeStore.getState().startedAtMs).toBe(firstAt);

    // Turns quick enough to merge into a double are fine — only the start time matters here.
    for (const m of rest) turn(m, 300);
    const s = useSmartCubeStore.getState();
    expect(s.solvedAtMs).not.toBeNull();
    expect(s.startedAtMs).toBe(firstAt);
    expect(s.crossAtMs! - s.startedAtMs!).toBeGreaterThan(0);
  }, 60_000);
});
