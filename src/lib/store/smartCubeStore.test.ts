import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

/** A cube the driver can get back silently: each reconnect hands over a fresh scripted link, or fails while `reachable` is false. */
function simLink(name = "SimCube") {
  const events$ = new Subject<unknown>();
  return {
    events$,
    connection: {
      deviceName: name,
      protocol: { name: "Sim" },
      capabilities: { battery: false, gyroscope: false, facelets: false, hardware: false, reset: false },
      events$,
      disconnect: async () => {},
      sendCommand: async () => {},
    },
  };
}

async function connectReconnectable() {
  const links = [simLink()];
  let reachable = true;
  const reconnect = vi.fn(async () => {
    if (!reachable) throw new Error("GATT Server is disconnected");
    const link = simLink();
    links.push(link);
    return link.connection;
  });
  (globalThis as Record<string, unknown>).__smartCubeTestDriver = { connectSmartCube: async () => links[0].connection, reconnect };
  useSmartCubeStore.setState({ supported: true });
  await useSmartCubeStore.getState().connect();
  return {
    reconnect,
    links,
    setReachable: (v: boolean) => {
      reachable = v;
    },
    drop: () => links[links.length - 1].events$.next({ type: "DISCONNECT" }),
  };
}

describe("auto-reconnect", () => {
  it("gets the cube back on its own a second after an unexpected drop", async () => {
    vi.useFakeTimers();
    const { reconnect, drop } = await connectReconnectable();
    drop();
    expect(useSmartCubeStore.getState().connected).toBe(false);
    expect(useSmartCubeStore.getState().reconnect).toEqual({ attempt: 0, trying: false });

    await vi.advanceTimersByTimeAsync(999);
    expect(reconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reconnect).toHaveBeenCalledTimes(1);
    const s = useSmartCubeStore.getState();
    expect(s.connected).toBe(true);
    expect(s.reconnect).toBeNull();
    expect(s.reconnectStopped).toBeNull();
    expect(s.reconnectNotice).toBeNull();
  });

  it("backs off between misses, then connects when the cube is back", async () => {
    vi.useFakeTimers();
    const { reconnect, drop, setReachable } = await connectReconnectable();
    setReachable(false);
    drop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(useSmartCubeStore.getState().reconnect).toEqual({ attempt: 1, trying: false });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(reconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(reconnect).toHaveBeenCalledTimes(2);
    setReachable(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reconnect).toHaveBeenCalledTimes(3);
    expect(useSmartCubeStore.getState().connected).toBe(true);
  });

  it("abandons a solve the drop interrupted, and says so once it's back", async () => {
    vi.useFakeTimers();
    const solve = fullSolveOn("U");
    const { links, drop } = await connectReconnectable();
    let t = 1_000;
    for (const m of solve.scramble.split(" ")) links[0].events$.next({ type: "MOVE", move: m, timestamp: (t += 10) });
    useSmartCubeStore.getState().arm();
    links[0].events$.next({ type: "MOVE", move: solve.moves[0], timestamp: (t += 300) });
    links[0].events$.next({ type: "MOVE", move: solve.moves[1], timestamp: (t += 300) });
    const facelets = useSmartCubeStore.getState().liveFacelets;

    drop();
    await vi.advanceTimersByTimeAsync(1_000);
    const s = useSmartCubeStore.getState();
    expect(s.connected).toBe(true);
    expect(s.armed).toBe(false);
    expect(s.recording).toBe(false);
    expect(s.moves).toEqual([]);
    expect(s.startedAtMs).toBeNull();
    expect(s.solvedAtMs).toBeNull();
    expect(s.droppedMidSolve).toBe(false);
    expect(s.reconnectNotice).toEqual({ lostMoves: 2 });
    // The app's picture of the cube survives the drop rather than snapping back to solved.
    expect(s.liveFacelets).toBe(facelets);

    useSmartCubeStore.getState().arm();
    expect(useSmartCubeStore.getState().reconnectNotice).toBeNull();
  });

  it("keeps a finished solve's recap when the drop came between solves", async () => {
    vi.useFakeTimers();
    const solve = fullSolveOn("U");
    const { links, drop } = await connectReconnectable();
    let t = 1_000;
    for (const m of solve.scramble.split(" ")) links[0].events$.next({ type: "MOVE", move: m, timestamp: (t += 10) });
    useSmartCubeStore.getState().arm();
    for (const m of solve.moves) links[0].events$.next({ type: "MOVE", move: m, timestamp: (t += 300) });
    const finished = useSmartCubeStore.getState();
    expect(finished.solvedAtMs).not.toBeNull();

    drop();
    await vi.advanceTimersByTimeAsync(1_000);
    const s = useSmartCubeStore.getState();
    expect(s.connected).toBe(true);
    expect(s.solvedAtMs).toBe(finished.solvedAtMs);
    expect(s.moves).toEqual(finished.moves);
    expect(s.reconnectNotice).toBeNull();
  });

  it("never kicks in after a deliberate disconnect, even one that reports DISCONNECT on the way out", async () => {
    vi.useFakeTimers();
    const { reconnect, links } = await connectReconnectable();
    links[0].connection.disconnect = async () => {
      links[0].events$.next({ type: "DISCONNECT" });
    };
    useSmartCubeStore.getState().disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reconnect).not.toHaveBeenCalled();
    expect(useSmartCubeStore.getState().reconnect).toBeNull();
    expect(useSmartCubeStore.getState().reconnectStopped).toBeNull();
  });

  it("stops when cancelled, and when you disconnect while it's waiting", async () => {
    vi.useFakeTimers();
    const first = await connectReconnectable();
    first.drop();
    useSmartCubeStore.getState().cancelReconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(first.reconnect).not.toHaveBeenCalled();
    expect(useSmartCubeStore.getState().reconnect).toBeNull();
    expect(useSmartCubeStore.getState().reconnectStopped).toBeNull();

    const second = await connectReconnectable();
    second.drop();
    useSmartCubeStore.getState().disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(second.reconnect).not.toHaveBeenCalled();
  });

  it("tries straight away on request, without waiting out the backoff", async () => {
    vi.useFakeTimers();
    const { reconnect, drop } = await connectReconnectable();
    drop();
    useSmartCubeStore.getState().reconnectNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(useSmartCubeStore.getState().connected).toBe(true);
  });

  it("gives up after a few minutes of misses, leaving the one-tap Reconnect", async () => {
    vi.useFakeTimers();
    const { reconnect, drop, setReachable } = await connectReconnectable();
    setReachable(false);
    drop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(reconnect).toHaveBeenCalledTimes(13);
    expect(useSmartCubeStore.getState().reconnect).toBeNull();
    expect(useSmartCubeStore.getState().reconnectStopped).toBe("gave-up");
  });

  it("says when this browser can't reconnect without a tap", async () => {
    const { events$ } = await connectSim();
    events$.next({ type: "DISCONNECT" });
    expect(useSmartCubeStore.getState().reconnect).toBeNull();
    expect(useSmartCubeStore.getState().reconnectStopped).toBe("unsupported");
  });

  it("stops once the page has been in the background a minute", async () => {
    vi.useFakeTimers();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
    vi.stubGlobal("document", doc);
    const { reconnect, drop, setReachable } = await connectReconnectable();
    setReachable(false);
    drop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reconnect).toHaveBeenCalledTimes(1);

    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(useSmartCubeStore.getState().reconnectStopped).toBe("hidden");
    const calls = reconnect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(reconnect).toHaveBeenCalledTimes(calls);
  });

  it("tries again right away when you come back to the page in time", async () => {
    vi.useFakeTimers();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
    vi.stubGlobal("document", doc);
    const { reconnect, drop, setReachable } = await connectReconnectable();
    setReachable(false);
    drop();
    await vi.advanceTimersByTimeAsync(1_000);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(reconnect).toHaveBeenCalledTimes(1);

    setReachable(true);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(useSmartCubeStore.getState().connected).toBe(true);
  });

  it("hands over to a connect by hand", async () => {
    vi.useFakeTimers();
    const { reconnect, drop } = await connectReconnectable();
    drop();
    await useSmartCubeStore.getState().connect();
    expect(useSmartCubeStore.getState().connected).toBe(true);
    expect(useSmartCubeStore.getState().reconnect).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reconnect).not.toHaveBeenCalled();
  });
});
