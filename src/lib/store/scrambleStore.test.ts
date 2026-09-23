import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Scramble generation is async (a worker for 3x3, a function for the other
 * sizes). These tests replace both with deferred promises the test resolves
 * by hand, in whatever order it likes — so a slow request can be made to
 * finish after a newer one, which is the race the store has to survive.
 */
type Deferred = { event: string; resolve: (s: string) => void; reject: (e: Error) => void };
const pending: Deferred[] = [];
const request = (event: string) =>
  new Promise<string>((resolve, reject) => pending.push({ event, resolve, reject }));
const solves: { scramble: string; resolve: (moves: string[]) => void }[] = [];

vi.mock("@/lib/cube-engine/client", () => ({
  getCubeEngineClient: () => ({
    ready: () => Promise.resolve(),
    generateScramble: () => request("333"),
    solveCross: (scramble: string) => new Promise<string[]>((resolve) => solves.push({ scramble, resolve })),
  }),
}));
vi.mock("@/lib/cube-engine/multiScramble", () => ({
  generateScrambleForEvent: (event: string) => request(event),
}));

const { useScrambleStore, resetScrambleRequestsForTests } = await import("./scrambleStore");
const store = () => useScrambleStore.getState();
/** Let awaited promises run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Resolves the oldest still-open request for `event`. */
async function finish(event: string, scramble: string) {
  const i = pending.findIndex((p) => p.event === event);
  if (i < 0) throw new Error(`no pending ${event} request`);
  pending.splice(i, 1)[0].resolve(scramble);
  await flush();
}

beforeEach(async () => {
  pending.length = 0;
  solves.length = 0;
  resetScrambleRequestsForTests();
  useScrambleStore.setState({ scramble: "", history: [], historyIndex: -1, event: "333", loadingScramble: false, practiceMode: false, crossHint: null, cfopHint: null, hintLoading: false, hintVisible: false, hintError: null });
});

describe("rapid scramble changes", () => {
  it("a slow first 3x3 scramble doesn't replace the 4x4 you switched to meanwhile", async () => {
    void store().init();
    await flush();
    void store().setEvent("444");
    await finish("444", "4x4 scramble");
    await finish("333", "late 3x3 scramble");
    expect(store()).toMatchObject({ event: "444", scramble: "4x4 scramble", history: ["4x4 scramble"], loadingScramble: false });
  });

  it("switching events twice quickly keeps the last one, whichever finishes first", async () => {
    void store().setEvent("444");
    void store().setEvent("555");
    await finish("555", "5x5 scramble");
    await finish("444", "4x4 scramble");
    expect(store()).toMatchObject({ event: "555", scramble: "5x5 scramble" });
  });

  it("a next-scramble started before an event switch is dropped", async () => {
    useScrambleStore.setState({ scramble: "A", history: ["A"], historyIndex: 0 });
    void store().nextScramble();
    void store().setEvent("222");
    await finish("222", "2x2 scramble");
    await finish("333", "stale 3x3");
    expect(store()).toMatchObject({ event: "222", scramble: "2x2 scramble", history: ["2x2 scramble"] });
  });

  it("advancing is disabled while a scramble is generating: pressing twice asks for one", async () => {
    useScrambleStore.setState({ scramble: "A", history: ["A"], historyIndex: 0 });
    void store().nextScramble();
    expect(store().loadingScramble).toBe(true);
    void store().nextScramble();
    void store().nextScramble();
    expect(pending).toHaveLength(1);
    await finish("333", "B");
    expect(store()).toMatchObject({ scramble: "B", history: ["A", "B"], historyIndex: 1, loadingScramble: false });
  });

  it("going back cancels a generation in flight", async () => {
    useScrambleStore.setState({ scramble: "B", history: ["A", "B"], historyIndex: 1 });
    void store().nextScramble();
    store().previousScramble();
    expect(store()).toMatchObject({ scramble: "A", loadingScramble: false });
    await finish("333", "C");
    expect(store()).toMatchObject({ scramble: "A", history: ["A", "B"], historyIndex: 0 });
  });

  it("a challenge link loaded mid-generation wins", async () => {
    useScrambleStore.setState({ scramble: "A", history: ["A"], historyIndex: 0 });
    void store().nextScramble();
    store().loadExternalScramble("R U R'");
    await finish("333", "late");
    expect(store()).toMatchObject({ scramble: "R U R'", history: ["A", "R U R'"], loadingScramble: false });
  });

  it("a failed generation doesn't leave advancing disabled", async () => {
    useScrambleStore.setState({ scramble: "A", history: ["A"], historyIndex: 0 });
    const next = store().nextScramble();
    pending.shift()!.reject(new Error("worker died"));
    await expect(next).rejects.toThrow("worker died");
    expect(store().loadingScramble).toBe(false);
    void store().nextScramble();
    expect(pending).toHaveLength(1);
  });

  it("a cross hint that finishes after the scramble changed isn't shown on the new one", async () => {
    useScrambleStore.setState({ scramble: "A", history: ["A"], historyIndex: 0 });
    // init() has already happened in the app; mark it done so the hint loader doesn't wait on it.
    void store().init();
    await flush();
    await finish("333", "A");
    void store().loadCrossHint();
    await flush();
    void store().nextScramble();
    await finish("333", "B");
    solves[0].resolve(["F", "R"]);
    await flush();
    expect(store()).toMatchObject({ scramble: "B", crossHint: null, hintLoading: false });
  });
});
