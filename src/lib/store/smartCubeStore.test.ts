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
  return { turn, events$ };
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

describe("unexpected disconnects", () => {
  it("flags a DISCONNECT that arrives mid-solve, with how many moves were made", async () => {
    const solve = fullSolveOn("U");
    const { turn, events$ } = await connectSim();
    for (const m of solve.scramble.split(" ")) turn(m, 10);
    useSmartCubeStore.getState().arm();
    turn(solve.moves[0]);
    turn(solve.moves[1]);

    events$.next({ type: "DISCONNECT" });

    const s = useSmartCubeStore.getState();
    expect(s.connected).toBe(false);
    expect(s.recording).toBe(false);
    expect(s.droppedMidSolve).toBe(true);
    expect(s.droppedMidSolveMoves).toBe(2);
  });

  it("doesn't flag a DISCONNECT while idle (nothing armed or in progress)", async () => {
    const { events$ } = await connectSim();
    events$.next({ type: "DISCONNECT" });
    const s = useSmartCubeStore.getState();
    expect(s.connected).toBe(false);
    expect(s.droppedMidSolve).toBe(false);
    expect(s.droppedMidSolveMoves).toBeNull();
  });

  it("never flags a deliberate disconnect() call, and clears any earlier flag", async () => {
    const solve = fullSolveOn("U");
    const { turn, events$ } = await connectSim();
    for (const m of solve.scramble.split(" ")) turn(m, 10);
    useSmartCubeStore.getState().arm();
    turn(solve.moves[0]);
    events$.next({ type: "DISCONNECT" });
    expect(useSmartCubeStore.getState().droppedMidSolve).toBe(true);

    // Reconnect, get mid-solve again, then disconnect on purpose this time.
    const { turn: turn2, events$: events2 } = await connectSim();
    for (const m of solve.scramble.split(" ")) turn2(m, 10);
    useSmartCubeStore.getState().arm();
    turn2(solve.moves[0]);
    useSmartCubeStore.getState().disconnect();
    expect(useSmartCubeStore.getState().droppedMidSolve).toBe(false);
    void events2;
  });

  it("clears the flag once reconnecting actually succeeds", async () => {
    const solve = fullSolveOn("U");
    const { turn, events$ } = await connectSim();
    for (const m of solve.scramble.split(" ")) turn(m, 10);
    useSmartCubeStore.getState().arm();
    turn(solve.moves[0]);
    events$.next({ type: "DISCONNECT" });
    expect(useSmartCubeStore.getState().droppedMidSolve).toBe(true);

    await connectSim();
    expect(useSmartCubeStore.getState().droppedMidSolve).toBe(false);
    expect(useSmartCubeStore.getState().droppedMidSolveMoves).toBeNull();
  });
});
