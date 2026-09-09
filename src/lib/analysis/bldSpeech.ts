/**
 * Turns a computed BLD memo into an ordered playback queue for speech
 * synthesis: letter pairs grouped into corner/edge sections, each pair
 * spoken as its individual letters (comma-separated, so a speech engine
 * reads "Q, R" rather than trying to pronounce "QR" as a word).
 */

import type { BldMemo } from "./bldMemo";
import { pairUp } from "./bldMemo";

export interface SpeechItem {
  section: "corner" | "edge";
  /** e.g. "QR" — what's shown on screen. */
  display: string;
  /** e.g. "Q, R" — what's actually spoken. */
  text: string;
}

export function buildSpeechQueue(memo: BldMemo): SpeechItem[] {
  const items: SpeechItem[] = [];
  const addWords = (words: readonly string[][], section: "corner" | "edge") => {
    for (const word of words) {
      for (const pair of pairUp(word)) {
        items.push({ section, display: pair, text: pair.split("").join(", ") });
      }
    }
  };
  addWords(memo.cornerWords, "corner");
  addWords(memo.edgeWords, "edge");
  return items;
}
