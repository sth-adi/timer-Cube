import { afterEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { fullSolveOn } from "@/lib/smartcube/testSolves";
import { cubeFromAlg } from "@/lib/cube-engine/engine";
import { getTimeMachineLog } from "@/lib/smartcube/timeMachine";
import { SOLVED_FACELETS, detectBrowserEnv, useSmartCubeStore } from "./smartCubeStore";
import { subscribeRawMoves } from "./smartCubeBus";
import { useGyroStore } from "./gyroStore";

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

/** A cube that reports its own state (so a lost turn can be corrected) and, optionally, its own clock. */
async function connectReportingSim() {
  const events$ = new Subject<unknown>();
  (globalThis as Record<string, unknown>).__smartCubeTestDriver = {
    connectSmartCube: async () => ({
      deviceName: "SimCube",
      protocol: { name: "Sim" },
      capabilities: { battery: false, gyroscope: false, facelets: true, hardware: false, reset: false },
      events$,
      disconnect: async () => {},
      sendCommand: async () => {},
    }),
  };
  useSmartCubeStore.setState({ supported: true });
  await useSmartCubeStore.getState().connect();
  // The first report since connecting is taken as the truth outright.
  events$.next({ type: "FACELETS", facelets: SOLVED_FACELETS, timestamp: 1_000 });
  let t = 1_000;
  const turn = (move: string, gapMs = 250) => {
    t += gapMs;
    events$.next({ type: "MOVE", move, timestamp: t });
    return t;
  };
  const report = (facelets: string, atMs: number) => {
    events$.next({ type: "FACELETS", facelets, timestamp: atMs });
    // The correction waits for the cube to be still for SETTLE_MS.
    vi.advanceTimersByTime(500);
  };
  return { turn, events$, report, now: () => t };
}

describe("corrections from the cube's own report", () => {
  it("doesn't flag a solve as corrected while the attempt is only armed (inspection)", async () => {
    vi.useFakeTimers();
    const solve = fullSolveOn("U");
    const { turn, report, now } = await connectReportingSim();
    const turns = solve.scramble.split(" ");
    for (const m of turns.slice(0, -1)) turn(m, 10);
    useSmartCubeStore.getState().arm();
    // The cube really did make the last scramble turn; the app never heard it.
    report(cubeFromAlg(solve.scramble).asString(), now() + 100);
    const s = useSmartCubeStore.getState();
    expect(s.liveFacelets).toBe(cubeFromAlg(solve.scramble).asString());
    expect(s.correctedDuringSolve).toBe(false);
    expect(s.recording).toBe(false);
  }, 60_000);

  it("flags a correction that lands mid-solve", async () => {
    vi.useFakeTimers();
    const solve = fullSolveOn("U");
    const { turn, report, now } = await connectReportingSim();
    for (const m of solve.scramble.split(" ")) turn(m, 10);
    useSmartCubeStore.getState().arm();
    turn(solve.moves[0]);
    // The second turn is lost; the cube's report has it.
    const state = cubeFromAlg(`${solve.scramble} ${solve.moves[0]} ${solve.moves[1]}`).asString();
    report(state, now() + 400);
    const s = useSmartCubeStore.getState();
    expect(s.recording).toBe(true);
    expect(s.correctedDuringSolve).toBe(true);
    expect(s.liveFacelets).toBe(state);
  }, 60_000);

  it("ends a solve the lost last turn finished about one turn after the last one heard", async () => {
    vi.useFakeTimers();
    const solve = fullSolveOn("U");
    const { turn, report } = await connectReportingSim();
    for (const m of solve.scramble.split(" ")) turn(m, 10);
    useSmartCubeStore.getState().arm();
    let lastAt = 0;
    for (const m of solve.moves.slice(0, -1)) lastAt = turn(m, 300);
    expect(useSmartCubeStore.getState().solvedAtMs).toBeNull();
    // The report arrives a full second later: the missing turn is guessed at one typical gap, not a second.
    report(SOLVED_FACELETS, lastAt + 1000);
    const s = useSmartCubeStore.getState();
    expect(s.recording).toBe(false);
    expect(s.armed).toBe(false);
    expect(s.correctedDuringSolve).toBe(true);
    expect(s.solvedAtMs).toBe(s.moves[s.moves.length - 1].timeStampMs + 300);
    // The splits it caught up to can't be later than the end.
    expect(s.ollAtMs!).toBeLessThanOrEqual(s.solvedAtMs!);
  }, 60_000);

  it("never dates the lost turn after the report that revealed it", async () => {
    vi.useFakeTimers();
    const solve = fullSolveOn("U");
    const { turn, report } = await connectReportingSim();
    for (const m of solve.scramble.split(" ")) turn(m, 10);
    useSmartCubeStore.getState().arm();
    let lastAt = 0;
    for (const m of solve.moves.slice(0, -1)) lastAt = turn(m, 300);
    report(SOLVED_FACELETS, lastAt + 120);
    expect(useSmartCubeStore.getState().solvedAtMs).toBe(lastAt + 120);
  }, 60_000);
});

describe("turns delivered in one notification", () => {
  it("doesn't date the end of a solve past the notification that carried it", async () => {
    const solve = fullSolveOn("U");
    const { events$, turn } = await connectReportingSim();
    for (const m of solve.scramble.split(" ")) turn(m, 10);
    useSmartCubeStore.getState().arm();
    // Everything but the last three turns arrives one by one, with the cube's own clock alongside.
    const body = solve.moves.slice(0, -3);
    const tail = solve.moves.slice(-3);
    let host = 5_000;
    let cube = 100;
    for (const m of body) {
      host += 300;
      cube += 300;
      events$.next({ type: "MOVE", move: m, timestamp: host, cubeTimestamp: cube });
    }
    // The last three were really 300ms apart, then delivered together at the moment the final one happened.
    const arrival = host + 900;
    for (const m of tail) {
      cube += 300;
      events$.next({ type: "MOVE", move: m, timestamp: arrival, cubeTimestamp: cube });
    }
    const s = useSmartCubeStore.getState();
    expect(s.solvedAtMs).not.toBeNull();
    expect(s.solvedAtMs!).toBeLessThanOrEqual(arrival);
    for (const m of s.moves) expect(m.timeStampMs).toBeLessThanOrEqual(arrival);
    const times = s.moves.map((m) => m.timeStampMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  }, 60_000);
});

describe("a failing bus listener", () => {
  it("never costs the cube a turn: the state is updated, the others still hear it, the Time Machine still records", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const heard: string[] = [];
    const seenFacelets: string[] = [];
    const offs = [
      subscribeRawMoves(() => {
        throw new Error("gesture handler bug");
      }),
      subscribeRawMoves((m) => {
        heard.push(m.token);
        seenFacelets.push(useSmartCubeStore.getState().liveFacelets);
      }),
    ];
    try {
      const { turn } = await connectSim();
      turn("R");
      turn("U");
      expect(heard).toEqual(["R", "U"]);
      expect(useSmartCubeStore.getState().liveFacelets).toBe(cubeFromAlg("R U").asString());
      // Listeners now run after the store applied the turn.
      expect(seenFacelets[1]).toBe(cubeFromAlg("R U").asString());
      expect(getTimeMachineLog().map((e) => e.token)).toEqual(["R", "U"]);
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      offs.forEach((off) => off());
      log.mockRestore();
    }
  });

  it("keeps recording an armed solve when a listener throws on every turn", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const solve = fullSolveOn("U");
    const off = subscribeRawMoves(() => {
      throw new Error("scramble guide bug");
    });
    try {
      const { turn } = await connectSim();
      for (const m of solve.scramble.split(" ")) turn(m, 10);
      useSmartCubeStore.getState().arm();
      for (const m of solve.moves) turn(m, 300);
      const s = useSmartCubeStore.getState();
      expect(s.solvedAtMs).not.toBeNull();
      expect(s.liveFacelets).toBe(SOLVED_FACELETS);
      expect(s.moves.length).toBeGreaterThan(0);
    } finally {
      off();
    }
  }, 60_000);

  it("still announces a solve's final turn while the attempt is armed, as before", async () => {
    const solve = fullSolveOn("U");
    let armedAtFinalTurn: boolean | null = null;
    const off = subscribeRawMoves(() => {
      armedAtFinalTurn = useSmartCubeStore.getState().armed;
    });
    try {
      const { turn } = await connectSim();
      for (const m of solve.scramble.split(" ")) turn(m, 10);
      useSmartCubeStore.getState().arm();
      for (const m of solve.moves) turn(m, 300);
      expect(useSmartCubeStore.getState().solvedAtMs).not.toBeNull();
      expect(armedAtFinalTurn).toBe(true);
    } finally {
      off();
    }
  }, 60_000);
});

describe("browser support starts unknown", () => {
  it("is null (neither supported nor unsupported) until the page asks the browser", () => {
    const initial = useSmartCubeStore.getInitialState();
    expect(initial.supported).toBeNull();
    expect(initial.lastCubeName).toBeNull();
  });

  it("resolves support and the remembered cube in one step", () => {
    vi.stubGlobal("navigator", { bluetooth: {} });
    vi.stubGlobal("localStorage", { getItem: () => "GAN356 i3", setItem: () => {}, removeItem: () => {} });
    expect(detectBrowserEnv()).toEqual({ supported: true, lastCubeName: "GAN356 i3" });
    vi.stubGlobal("navigator", {});
    expect(detectBrowserEnv().supported).toBe(false);
  });

  it("refuses to connect while support is unknown", async () => {
    useSmartCubeStore.setState({ supported: null, error: null });
    await useSmartCubeStore.getState().connect();
    expect(useSmartCubeStore.getState().error).toMatch(/Web Bluetooth/);
    expect(useSmartCubeStore.getState().connecting).toBe(false);
  });
});

describe("gyro home pose across reconnects", () => {
  const q = (deg: number) => ({ x: 0, y: 0, z: Math.sin((deg * Math.PI) / 360), w: Math.cos((deg * Math.PI) / 360) });
  const gyro = (events$: Subject<unknown>, atMs: number, deg: number) => events$.next({ type: "GYRO", timestamp: atMs, quaternion: q(deg) });

  it("takes the first sample as home on a fresh connect, with nothing flagged", async () => {
    useGyroStore.setState({ ref: null });
    const { events$ } = await connectSim();
    gyro(events$, 100, 10);
    expect(useGyroStore.getState().ref).toEqual(q(10));
    expect(useSmartCubeStore.getState().gyroNeedsRecenter).toBe(false);
  });

  it("keeps the home reference when the same cube comes straight back", async () => {
    vi.useFakeTimers();
    useGyroStore.setState({ ref: null });
    const { links, drop } = await connectReconnectable();
    gyro(links[0].events$, 100, 10);
    const home = useGyroStore.getState().ref;
    drop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(useSmartCubeStore.getState().connected).toBe(true);
    expect(useGyroStore.getState().ref).toBe(home);
    // The cube is held differently now; that must not become the new home.
    gyro(links[1].events$, 2_000, 90);
    expect(useGyroStore.getState().ref).toBe(home);
    expect(useSmartCubeStore.getState().gyroNeedsRecenter).toBe(false);
  });

  it("waits for the cube to be still before taking a new home after a long drop, and flags it", async () => {
    vi.useFakeTimers();
    useGyroStore.setState({ ref: null });
    const { links, drop, setReachable } = await connectReconnectable();
    gyro(links[0].events$, 100, 10);
    setReachable(false);
    drop();
    await vi.advanceTimersByTimeAsync(60_000);
    setReachable(true);
    await vi.advanceTimersByTimeAsync(30_000); // the steady retry interval
    expect(useSmartCubeStore.getState().connected).toBe(true);
    expect(useGyroStore.getState().ref).toBeNull();
    expect(useSmartCubeStore.getState().gyroNeedsRecenter).toBe(true);

    const link = links[links.length - 1];
    gyro(link.events$, 1_000, 30); // still being regripped...
    gyro(link.events$, 1_100, 60);
    expect(useGyroStore.getState().ref).toBeNull();
    gyro(link.events$, 1_200, 61);
    gyro(link.events$, 1_700, 61.5); // ...then held still for 400ms+
    expect(useGyroStore.getState().ref).toEqual(q(61.5));
    // The guess is unverified until someone re-centers.
    expect(useSmartCubeStore.getState().gyroNeedsRecenter).toBe(true);
  });

  it("clears the flag on a re-center, from the button action or straight from the gyro store", async () => {
    vi.useFakeTimers();
    useGyroStore.setState({ ref: null });
    const { links, drop, setReachable } = await connectReconnectable();
    gyro(links[0].events$, 100, 10);
    setReachable(false);
    drop();
    await vi.advanceTimersByTimeAsync(40_000);
    setReachable(true);
    await vi.advanceTimersByTimeAsync(30_000);
    const link = links[links.length - 1];
    expect(useSmartCubeStore.getState().gyroNeedsRecenter).toBe(true);

    gyro(link.events$, 1_000, 20);
    expect(useSmartCubeStore.getState().recenterGyro()).toBe(true);
    expect(useSmartCubeStore.getState().gyroNeedsRecenter).toBe(false);
    expect(useGyroStore.getState().ref).toEqual(q(20));

    useSmartCubeStore.setState({ gyroNeedsRecenter: true });
    useGyroStore.getState().recenter(); // e.g. the cube gesture
    expect(useSmartCubeStore.getState().gyroNeedsRecenter).toBe(false);
  });
});
