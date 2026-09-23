"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookmarkPlus, Check, Circle, Fingerprint, Square, Timer as TimerIcon, Trash2 } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { ConnectGate } from "@/components/smartcube/ConnectGate";
import { RouteChips } from "@/components/smartcube/RouteChips";
import { FaceletNet } from "@/components/scramble/ScrambleNet";
import { CaseIcon } from "@/components/algorithms/CaseIcon";
import { subscribeRawMoves } from "@/lib/store/smartCubeBus";
import { useAlgIdStore } from "@/lib/store/algIdStore";
import { identifyAlg, type AlgIdentity } from "@/lib/smartcube/algId";
import { findCase } from "@/lib/algorithms/caseLookup";
import { invertAlg } from "@/lib/algorithms/algUtils";
import { scrambleToFacelets } from "@/lib/cube-engine/facelets";
import { cn } from "@/lib/utils/cn";

/** Recording stops on its own after a pause this long. */
const AUTO_STOP_MS = 2000;

const KIND_LABEL: Record<AlgIdentity["kind"], string> = {
  identity: "Does nothing",
  oll: "OLL algorithm",
  pll: "PLL algorithm",
  auf: "Just an AUF",
  other: "Not a last-layer algorithm",
};

const COLOR_HEX: Record<string, string> = {
  White: "#f5f5f0",
  Yellow: "#ffd42a",
  Green: "#1fa64c",
  Blue: "#2f6bff",
  Red: "#e0332f",
  Orange: "#ff8c1a",
};

/** A piece drawn as its sticker colors side by side. */
function Piece({ name }: { name: string }) {
  return (
    <span className="inline-flex overflow-hidden rounded-[3px] ring-1 ring-black/30" title={name}>
      {name.split("-").map((c) => (
        <span key={c} className="h-3.5 w-2.5" style={{ background: COLOR_HEX[c] }} />
      ))}
    </span>
  );
}

function CycleRow({ cycle }: { cycle: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {cycle.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          <Piece name={p} />
          <span className="text-[10px] text-muted-2">{i < cycle.length - 1 ? "→" : "↩"}</span>
        </span>
      ))}
    </div>
  );
}

function Result({ id, onSave, saved }: { id: AlgIdentity; onSave: () => void; saved: boolean }) {
  const group = id.kind === "pll" ? "PLL" : "OLL";
  const algCase = id.caseName ? findCase(group, id.caseName) : undefined;
  const { effect } = id;
  return (
    <div className="card flex flex-col gap-3 rounded-xl p-4">
      <div className="flex items-center gap-3">
        {algCase ? (
          <CaseIcon setupAlg={invertAlg(algCase.alg)} kind={group} className="h-14 w-14 shrink-0 overflow-hidden rounded" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-bg-panel-2">
            <Fingerprint size={22} className="text-accent" />
          </div>
        )}
        <div className="flex flex-col">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">{KIND_LABEL[id.kind]}</p>
          <p className="text-lg font-bold text-foreground">{id.caseName ?? (id.kind === "other" ? "Custom sequence" : KIND_LABEL[id.kind])}</p>
          {id.caseName && (
            <p className={cn("text-[11px] font-medium", id.isBookAlg ? "text-success" : "text-accent")}>
              {id.isBookAlg ? "The book algorithm" : "Your own variant"}
            </p>
          )}
        </div>
      </div>

      <p className="break-words rounded-lg bg-bg-panel-2 px-3 py-2 font-mono text-sm font-semibold text-foreground">{id.notation || "—"}</p>
      {id.bookAlg && !id.isBookAlg && <p className="text-[11px] text-muted">Book alg: <span className="font-mono">{id.bookAlg}</span></p>}

      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          [id.htm, "turns"],
          [id.qtm, "quarter turns"],
          [id.durationMs ? `${(id.durationMs / 1000).toFixed(2)}s` : "—", "execution"],
          [id.tps !== null ? id.tps.toFixed(1) : "—", "TPS"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-bg-panel-2 px-1 py-1.5">
            <p className="text-sm font-bold tabular-nums text-foreground">{v}</p>
            <p className="text-[9px] text-muted-2">{l}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted">
        Repeat it <span className="font-semibold text-foreground">{id.order}×</span> and you&apos;re back where you started.
        {id.layer && id.kind !== "identity" && " Everything it changes stays in one layer — F2L survives."}
      </p>

      {effect.movedCount > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">What it does to the pieces</p>
          {effect.cornerCycles.map((c) => (
            <div key={c.join()} className="flex items-center gap-2">
              <span className="w-24 text-[10px] text-muted">{c.length === 2 ? "Swaps corners" : `${c.length}-cycle corners`}</span>
              <CycleRow cycle={c} />
            </div>
          ))}
          {effect.edgeCycles.map((c) => (
            <div key={c.join()} className="flex items-center gap-2">
              <span className="w-24 text-[10px] text-muted">{c.length === 2 ? "Swaps edges" : `${c.length}-cycle edges`}</span>
              <CycleRow cycle={c} />
            </div>
          ))}
          {effect.twisted.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-24 text-[10px] text-muted">Twists in place</span>
              <div className="flex flex-wrap gap-1">
                {effect.twisted.map((p) => (
                  <Piece key={p} name={p} />
                ))}
              </div>
            </div>
          )}
          {effect.flipped.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-24 text-[10px] text-muted">Flips in place</span>
              <div className="flex flex-wrap gap-1">
                {effect.flipped.map((p) => (
                  <Piece key={p} name={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {id.kind !== "identity" && (
        <button
          type="button"
          onClick={onSave}
          disabled={saved}
          className="flex items-center justify-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-semibold text-foreground disabled:text-success"
        >
          {saved ? <Check size={13} /> : <BookmarkPlus size={13} />} {saved ? "Saved to My Algs" : "Save to My Algs"}
        </button>
      )}
    </div>
  );
}

type Phase = "idle" | "recording" | "done";

/**
 * Alg Identifier: record any sequence on the cube and get back what it is
 * — the case it solves (and whether that's the book alg), what it does to
 * every piece, its order, and how fast you did it.
 */
function AlgIdentifier() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [moves, setMoves] = useState<{ token: string; at: number }[]>([]);
  const [savedNotation, setSavedNotation] = useState<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const stopTimer = useRef<number | null>(null);
  const savedAlgs = useAlgIdStore((s) => s.saved);
  const save = useAlgIdStore((s) => s.save);
  const remove = useAlgIdStore((s) => s.remove);

  const stop = useCallback(() => {
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    phaseRef.current = "done";
    setPhase("done");
  }, []);

  const start = () => {
    setMoves([]);
    setSavedNotation(null);
    phaseRef.current = "recording";
    setPhase("recording");
  };

  useEffect(() => {
    return subscribeRawMoves((m) => {
      if (phaseRef.current !== "recording") return;
      setMoves((prev) => [...prev, { token: m.token, at: m.timeStampMs }]);
      if (stopTimer.current) window.clearTimeout(stopTimer.current);
      stopTimer.current = window.setTimeout(stop, AUTO_STOP_MS);
    });
  }, [stop]);
  useEffect(() => () => void (stopTimer.current && window.clearTimeout(stopTimer.current)), []);

  const identity = useMemo(
    () => (phase === "done" && moves.length > 0 ? identifyAlg(moves.map((m) => m.token), moves.map((m) => m.at)) : null),
    [phase, moves],
  );
  const effectFacelets = useMemo(() => scrambleToFacelets(moves.map((m) => m.token).join(" ")), [moves]);
  const tokens = moves.map((m) => m.token);

  return (
    <div className="flex flex-col gap-3">
      {phase !== "done" && (
        <div className="card flex flex-col items-center gap-3 rounded-xl p-4 text-center">
          <div className="w-36">
            <FaceletNet facelets={effectFacelets} className="w-full" />
          </div>
          {phase === "idle" ? (
            <>
              <p className="max-w-xs text-xs text-muted">
                Press record, then do any sequence — a new alg from a video, a trick you found, anything. Recording stops by itself when you
                pause for {AUTO_STOP_MS / 1000}s. Start from any state: only what the sequence <em>does</em> matters.
              </p>
              <button type="button" onClick={start} className="flex items-center gap-1.5 rounded-full bg-danger px-5 py-2.5 text-sm font-semibold text-white">
                <Circle size={12} fill="currentColor" /> Record
              </button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                <Circle size={9} fill="currentColor" className="animate-pulse" /> Recording · {tokens.length} turns
              </p>
              {tokens.length > 0 && <RouteChips display={tokens} turns={tokens} position={tokens.length} variant="color" />}
              <button type="button" onClick={stop} className="flex items-center gap-1.5 rounded-full bg-bg-panel-2 px-4 py-2 text-xs font-semibold text-foreground">
                <Square size={11} fill="currentColor" /> Stop
              </button>
            </>
          )}
        </div>
      )}

      {phase === "done" && identity && (
        <>
          <Result
            id={identity}
            saved={savedNotation === identity.notation}
            onSave={() => {
              save(identity);
              setSavedNotation(identity.notation);
            }}
          />
          <button type="button" onClick={start} className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
            <Circle size={11} fill="currentColor" /> Record another
          </button>
        </>
      )}
      {phase === "done" && !identity && (
        <button type="button" onClick={start} className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
          Nothing recorded — try again
        </button>
      )}

      {savedAlgs.length > 0 && (
        <div className="card flex flex-col gap-1.5 rounded-xl p-3">
          <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">My algs</p>
          {savedAlgs.map((a) => (
            <div key={a.notation} className="flex items-center gap-2 rounded-lg bg-bg-panel-2 px-2.5 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[11px] font-semibold text-foreground">
                  {a.caseName ?? "Custom"} {a.caseName && !a.isBookAlg && <span className="font-normal text-accent">· variant</span>}
                </span>
                <span className="break-words font-mono text-[11px] text-muted">{a.notation}</span>
              </div>
              <div className="flex flex-col items-end text-[10px] tabular-nums text-muted-2">
                <span>{a.bestMs !== null ? `${(a.bestMs / 1000).toFixed(2)}s best` : "—"}</span>
                <span>{a.timesRecorded}× recorded</span>
              </div>
              <button type="button" onClick={() => remove(a.notation)} className="text-muted-2 hover:text-danger" aria-label="Remove">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AlgIdPage() {
  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Fingerprint size={17} className="text-accent" /> Alg Identifier
            </h1>
            <p className="text-[11px] text-muted-2">Do any sequence on your cube and find out exactly what it is.</p>
          </div>
          <ConnectGate blurb="The Alg Identifier reads the turns straight off your smart cube, so it needs one connected.">
            <AlgIdentifier />
          </ConnectGate>
        </div>
      </div>
    </>
  );
}
