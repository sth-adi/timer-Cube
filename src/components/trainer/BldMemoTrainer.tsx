"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, ChevronDown, Play, Square } from "lucide-react";
import { useScrambleStore } from "@/lib/store/scrambleStore";
import { buildBldMemo } from "@/lib/analysis/bldMemo";
import { buildSpeechQueue, type SpeechItem } from "@/lib/analysis/bldSpeech";
import { CORNER_SLOT_LABELS, EDGE_SLOT_LABELS, CORNER_LETTER, EDGE_LETTER, letterName } from "@/lib/analysis/bldLettering";
import { cn } from "@/lib/utils/cn";

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

function LegendTable({ labels, table }: { labels: readonly string[]; table: readonly (readonly number[])[] }) {
  return (
    <div className="grid grid-cols-4 gap-1 text-[10px] sm:grid-cols-6">
      {table.map((row, slot) => (
        <div key={labels[slot]} className="rounded-md bg-bg-panel-2 px-1.5 py-1 text-center">
          <p className="font-mono text-muted-2">{labels[slot]}</p>
          <p className="font-medium text-foreground">{row.map(letterName).join(" ")}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Reads the current scramble's blindfold memo aloud, letter pair by letter
 * pair, so you can practice memorizing hands-free instead of staring at
 * text while trying to also picture the cube. The lettering scheme itself
 * (Speffz-style — see lib/analysis/bldLettering.ts) is shown in a legend
 * so nothing here depends on already knowing it.
 */
export function BldMemoTrainer() {
  const scramble = useScrambleStore((s) => s.scramble);
  const [showLegend, setShowLegend] = useState(false);
  const [rate, setRate] = useState(0.85);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(-1);

  const memo = useMemo(() => (scramble ? buildBldMemo(scramble) : null), [scramble]);
  const queue = useMemo<SpeechItem[]>(() => (memo ? buildSpeechQueue(memo) : []), [memo]);

  const cursorRef = useRef(-1);
  const queueRef = useRef<SpeechItem[]>([]);
  const rateRef = useRef(rate);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  // Stop mid-playback the moment the scramble changes or the trainer is
  // left — an utterance queued against a memo that no longer matches
  // what's on screen would be actively misleading, not just stale.
  useEffect(() => {
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
    };
  }, [scramble]);

  const speakFrom = useCallback((startIndex: number) => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();

    const step = (i: number) => {
      const list = queueRef.current;
      if (i >= list.length) {
        cursorRef.current = -1;
        setCursor(-1);
        setPlaying(false);
        return;
      }
      cursorRef.current = i;
      setCursor(i);
      const item = list[i];
      const utter = new SpeechSynthesisUtterance(item.text);
      utter.rate = rateRef.current;
      utter.onend = () => step(i + 1);
      utter.onerror = () => step(i + 1);
      window.speechSynthesis.speak(utter);
    };

    setPlaying(true);
    step(startIndex);
  }, []);

  const stop = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    setPlaying(false);
    setCursor(-1);
    cursorRef.current = -1;
  }, []);

  const nothingToMemo = memo !== null && memo.cornersSolved && memo.edgesSolved;

  return (
    <div className="flex w-full max-w-xl flex-col gap-3 pb-4">
      <div className="card rounded-xl p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Brain size={15} className="text-accent" />
          BLD memo trainer
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Letter pairs for this scramble&apos;s corners and edges, using a Speffz-style lettering scheme. Play them
          aloud and try to build your memo without looking.
        </p>

        {!scramble ? (
          <p className="text-xs text-muted-2">Waiting on a scramble…</p>
        ) : nothingToMemo ? (
          <p className="text-xs text-muted-2">This scramble is already solved — nothing to memorize.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (playing ? stop() : speakFrom(0))}
                disabled={!speechSupported}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg disabled:opacity-40"
              >
                {playing ? <Square size={13} /> : <Play size={13} />}
                {playing ? "Stop" : "Speak memo"}
              </button>
              <label className="flex items-center gap-1.5 text-[11px] text-muted">
                speed
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="accent-[var(--accent)]"
                />
              </label>
              {!speechSupported && <span className="text-[11px] text-muted-2">voice isn&apos;t supported in this browser — read the letters below</span>}
            </div>

            {(["corner", "edge"] as const).map((section) => {
              const items = queue.map((item, i) => ({ item, i })).filter(({ item }) => item.section === section);
              if (items.length === 0) return null;
              return (
                <div key={section} className="mb-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
                    {section === "corner" ? "Corners" : "Edges"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map(({ item, i }) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => speakFrom(i)}
                        disabled={!speechSupported}
                        className={cn(
                          "rounded-md px-2 py-1 font-mono text-xs font-medium transition-colors disabled:cursor-default",
                          i === cursor ? "bg-accent text-accent-fg" : "bg-bg-panel-2 text-foreground hover:bg-bg-panel-2/70",
                        )}
                        title="Replay from here"
                      >
                        {item.display}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="card rounded-xl p-3">
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-medium text-muted hover:text-foreground"
        >
          Lettering reference
          <ChevronDown size={14} className={cn("transition-transform", showLegend && "rotate-180")} />
        </button>
        {showLegend && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[11px] leading-relaxed text-muted-2">
              Each corner sticker and each edge sticker has its own letter. The buffer (where you always look first)
              is <span className="font-mono font-semibold text-foreground">A</span> for both. A word is the chain of
              letters starting from wherever a piece currently sits, all the way back to the buffer.
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Corners (slot → U/L/F/R/B/D letters)</p>
            <LegendTable labels={CORNER_SLOT_LABELS} table={CORNER_LETTER} />
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Edges (slot → letters)</p>
            <LegendTable labels={EDGE_SLOT_LABELS} table={EDGE_LETTER} />
          </div>
        )}
      </div>
    </div>
  );
}
