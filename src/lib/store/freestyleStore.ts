import { create } from "zustand";

/**
 * What the Freestyle capture is doing right now, for the UI to show — the
 * scramble bar swaps its text for a prompt while `awaiting`, and the
 * smart-cube timer shows the live status. Runtime-only; the on/off switch
 * itself is the persisted `freestyle` setting.
 */
interface FreestyleState {
  /** Freestyle is on and the cube is waiting to be mixed up. */
  awaiting: boolean;
  status: "listening" | "checking" | "easy" | "failed";
  /** Turns made since the last capture (or since the cube was last solved and left alone). */
  turns: number;
  /** For "easy": how many moves from solved the shuffle was found to be. */
  easyMoves: number | null;
}

export const useFreestyleStore = create<FreestyleState>(() => ({
  awaiting: false,
  status: "listening",
  turns: 0,
  easyMoves: null,
}));

export function resetFreestyleStore(): void {
  useFreestyleStore.setState({ awaiting: false, status: "listening", turns: 0, easyMoves: null });
}
