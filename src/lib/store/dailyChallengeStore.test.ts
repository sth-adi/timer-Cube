import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = { ready: vi.fn(), generateScramble: vi.fn() };
vi.mock("@/lib/cube-engine/client", () => ({ getCubeEngineClient: () => engine }));

import { DAILY_CHALLENGE_LENGTH, useDailyChallengeStore } from "./dailyChallengeStore";

describe("dailyChallengeStore.ensureToday", () => {
  beforeEach(() => {
    useDailyChallengeStore.setState({ dateKey: "", scrambles: [], times: [], loading: false, error: false });
    engine.ready.mockReset();
    engine.generateScramble.mockReset();
  });

  it("flags an error and stops loading when the worker rejects, then recovers on retry", async () => {
    engine.ready.mockRejectedValueOnce(new Error("worker died"));
    await useDailyChallengeStore.getState().ensureToday();
    expect(useDailyChallengeStore.getState()).toMatchObject({ loading: false, error: true, scrambles: [] });

    engine.ready.mockResolvedValue(undefined);
    engine.generateScramble.mockResolvedValue("R U R'");
    await useDailyChallengeStore.getState().ensureToday();
    const s = useDailyChallengeStore.getState();
    expect(s.error).toBe(false);
    expect(s.loading).toBe(false);
    expect(s.scrambles).toHaveLength(DAILY_CHALLENGE_LENGTH);
  });

  it("recovers from a synchronous throw too", async () => {
    engine.ready.mockImplementationOnce(() => {
      throw new Error("sync");
    });
    await useDailyChallengeStore.getState().ensureToday();
    expect(useDailyChallengeStore.getState().error).toBe(true);
    engine.ready.mockResolvedValue(undefined);
    engine.generateScramble.mockResolvedValue("R U R'");
    await useDailyChallengeStore.getState().ensureToday();
    expect(useDailyChallengeStore.getState().scrambles).toHaveLength(DAILY_CHALLENGE_LENGTH);
  });
});
