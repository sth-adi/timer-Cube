import { beforeEach, describe, expect, it } from "vitest";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { myAlgKey } from "@/lib/algorithms/myAlgs";
import type { AlgExecution } from "@/lib/xray/algMicroscope";
import { useMyAlgsStore } from "./myAlgsStore";

describe("myAlgsStore", () => {
  const tPerm = findCase("PLL", "T Perm")!;
  // A T-perm is its own inverse, so the book algorithm backwards is a different algorithm for the same case.
  const altT = invertAlg(tPerm.alg);
  const key = myAlgKey("PLL", "T Perm");
  const exec = (alg: string): AlgExecution => ({
    step: "PLL",
    caseName: "T Perm",
    alg,
    tokens: alg.split(" "),
    recognitionMs: 500,
    executionMs: 1500,
    gaps: [],
    date: 1,
    oneLook: true,
    clean: true,
    mergedAlg: alg,
  });

  beforeEach(() => {
    useMyAlgsStore.setState({ chosen: {}, manualKeys: [], seen: {}, dismissed: {}, learnedThrough: 0, recent: [] });
  });

  it("learns an algorithm you use", () => {
    useMyAlgsStore.getState().learn([exec(altT)], 1);
    expect(useMyAlgsStore.getState().seen[key].map((x) => x.alg)).toContain(altT);
  });

  it("does not bring a dismissed algorithm back when it is used again", () => {
    const s = useMyAlgsStore.getState();
    s.learn([exec(altT)], 1);
    useMyAlgsStore.getState().dismiss(key, altT);
    useMyAlgsStore.getState().learn([exec(altT), exec(tPerm.alg)], 2);
    const st = useMyAlgsStore.getState();
    expect(st.seen[key].map((x) => x.alg)).not.toContain(altT);
    expect(st.seen[key].map((x) => x.alg)).toContain(tPerm.alg);
    expect(st.recent.filter((r) => r.alg === altT)).toHaveLength(0);
  });
});
