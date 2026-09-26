import { create } from "zustand";
import { persist } from "zustand/middleware";

interface QuestState {
  /** Quest id → XP awarded when it was claimed. */
  claimed: Record<string, number>;
  claim: (id: string, xp: number) => void;
}

export const useQuestStore = create<QuestState>()(
  persist(
    (set) => ({
      claimed: {},
      claim: (id, xp) => set((s) => (s.claimed[id] ? s : { claimed: { ...s.claimed, [id]: xp } })),
    }),
    { name: "cube-timer-quests" },
  ),
);
