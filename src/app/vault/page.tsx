"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Lock, RotateCcw, Share2, Unlock } from "lucide-react";
import { PlayShell, TurnPad } from "@/components/play/PlayShell";
import { VaultArt } from "@/components/play/Art";
import { FaceletNet } from "@/components/scramble/ScrambleNet";
import { usePlayInput } from "@/lib/play/usePlayInput";
import { mergeTurn } from "@/lib/smartcube/scrambleGuide";
import { SOLVED_FACELETS } from "@/lib/store/smartCubeStore";
import { Cube } from "@/lib/cube-engine/engine";
import { decodeSealed, encodeSealed, open, seal, strengthBits, strengthLabel, type Sealed } from "@/lib/play/vault";
import { cn } from "@/lib/utils/cn";

const ACCENT = "#ffc53d";

const STRENGTH_COPY: Record<ReturnType<typeof strengthLabel>, { label: string; color: string }> = {
  none: { label: "No key yet — the solved cube opens anything", color: "#8d88a8" },
  toy: { label: "Toy lock — a friend could brute-force it", color: "#ff8a1e" },
  fair: { label: "Fair — nobody's guessing this by hand", color: "#ffd400" },
  strong: { label: "Strong — beyond any laptop", color: "#3dffa8" },
  max: { label: "Every state is equally likely — the maximum", color: "#38e1ff" },
};

/**
 * Cube Vault: the cube *is* the password. Twist it into any state, write a
 * message, and seal it — the state's 54 stickers become an AES-256 key
 * (vault.ts). The link holds only ciphertext; it opens in the one moment
 * someone's cube reaches that exact state. There's no "close", no hint
 * from the lock, no key stored anywhere.
 */
export default function VaultPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => {
      const m = window.location.hash.match(/v=([^&]+)/);
      setToken(m ? m[1] : null);
      setReady(true);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const sealed = token ? decodeSealed(token) : null;

  return (
    <PlayShell accent={ACCENT} title="Cube Vault" tagline="Your cube is the password. Twist it into a state, seal a message with it, and send the link — it only opens when someone twists their cube into that exact state.">
      {!ready ? null : sealed ? <UnlockView sealed={sealed} /> : token ? <p className="text-sm text-red-300">That vault link is damaged — ask for it again.</p> : <LockView />}
    </PlayShell>
  );
}

function KeyNet({ facelets, dim }: { facelets: string; dim?: boolean }) {
  return (
    <div className={cn("rounded-xl bg-black/30 p-3 transition-opacity", dim && "opacity-60")}>
      <FaceletNet facelets={facelets} className="w-full" />
    </div>
  );
}

function LockView() {
  const [keyTurns, setKeyTurns] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);
  const { facelets, press, resetVirtual, connected } = usePlayInput((t) => {
    setKeyTurns((k) => mergeTurn(k, t.physical));
    setLink(null);
  });

  const solved = facelets === SOLVED_FACELETS;
  const bits = solved ? 0 : strengthBits(keyTurns.length);
  const strength = STRENGTH_COPY[strengthLabel(bits)];
  // The turns are only a recipe for this state if they started from solved.
  const recipeValid = keyTurns.length > 0 && (() => {
    const c = new Cube();
    c.move(keyTurns.join(" "));
    return c.asString() === facelets;
  })();

  const doSeal = async () => {
    setSealing(true);
    const s = await seal(message.trim(), facelets, hint.trim());
    setLink(`${window.location.origin}/vault#v=${encodeSealed(s)}`);
    setSealing(false);
  };

  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "A Cube Vault for you", text: hint ? `Hint: ${hint}` : "Twist your cube to open it.", url: link });
        return;
      } catch {
        // cancelled — fall through to copy
      }
    }
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="play-panel flex flex-col gap-3 rounded-2xl p-4">
        <Step n={1} title="Twist the key" />
        <KeyNet facelets={facelets} dim={solved} />
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] font-semibold" style={{ color: strength.color }}>
              {solved ? "Solved" : `≈${Math.round(bits)} bits`} · {strength.label}
            </span>
            <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (bits / 65.2) * 100)}%`, background: strength.color }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              resetVirtual();
              setKeyTurns([]);
              setLink(null);
            }}
            className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[var(--play-dim)] hover:text-white"
          >
            <RotateCcw size={12} /> {connected ? "I've solved it" : "Reset"}
          </button>
        </div>
        {!connected && <TurnPad onTurn={press} />}
        <p className="text-[11px] leading-snug text-[var(--play-dim)]">
          {connected
            ? "Every turn of your cube changes the key. About 20 random turns reaches the full 43 quintillion states."
            : "No cube connected: twist the virtual one with the pad or csTimer keys (I K D E J F S L H G W O). Connect a smart cube to use the real thing."}
        </p>
      </section>

      <section className="play-panel flex flex-col gap-3 rounded-2xl p-4">
        <Step n={2} title="Write the secret" />
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setLink(null);
          }}
          rows={4}
          maxLength={4000}
          placeholder="Meet me at the comp. Bring the GAN."
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--play-accent)]"
        />
        <input
          value={hint}
          onChange={(e) => {
            setHint(e.target.value);
            setLink(null);
          }}
          maxLength={140}
          placeholder="Public hint (optional) — e.g. “the scramble from our first race”"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-[var(--play-accent)]"
        />
      </section>

      <section className="play-panel flex flex-col gap-3 rounded-2xl p-4">
        <Step n={3} title="Seal it" />
        {!link ? (
          <button type="button" disabled={!message.trim() || sealing} onClick={() => void doSeal()} className="play-btn play-glow flex items-center justify-center gap-2 py-3 text-sm">
            <Lock size={16} /> {sealing ? "Sealing…" : solved ? "Seal (with no key — anyone opens it)" : "Seal with this cube state"}
          </button>
        ) : (
          <div className="flex flex-col gap-2 animate-fade-in-up">
            <div className="break-all rounded-xl bg-black/40 p-3 font-mono text-[10.5px] leading-relaxed text-[var(--play-accent)]">{link}</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void share()} className="play-btn flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm">
                {copied ? <Check size={15} /> : "share" in navigator ? <Share2 size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Share link"}
              </button>
              <a href={link} target="_blank" rel="noreferrer" className="flex items-center rounded-full border border-white/15 px-4 text-[12px] font-semibold text-white/80">
                Test it
              </a>
            </div>
          </div>
        )}
        {recipeValid && (
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => setShowRecipe((v) => !v)} className="self-start text-[11px] font-semibold text-[var(--play-accent)]">
              {showRecipe ? "Hide" : "Show"} the key as a scramble
            </button>
            {showRecipe && (
              <p className="rounded-lg bg-black/30 p-2 font-mono text-[12px] text-white/90">
                {keyTurns.join(" ")}
                <span className="mt-1 block font-sans text-[10.5px] text-[var(--play-dim)]">
                  From solved (white top, green front), this reaches the key. Tell it to them some other way — never in the same message as the link.
                </span>
              </p>
            )}
          </div>
        )}
        <p className="text-[10.5px] leading-snug text-[var(--play-dim)]">
          The link carries only ciphertext (AES-256-GCM, key stretched from the 54 stickers with 120,000 rounds of PBKDF2). Nothing is uploaded, and nothing — not even this app — can open it without the state.
        </p>
      </section>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--play-accent)] text-[12px] font-black text-black">{n}</span>
      <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function UnlockView({ sealed }: { sealed: Sealed }) {
  const [message, setMessage] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [shake, setShake] = useState(0);
  const [recipe, setRecipe] = useState("");
  const tried = useRef(new Set<string>());
  const busy = useRef(false);
  const { facelets, press, resetVirtual, connected } = usePlayInput(() => {});

  const attempt = useCallback(
    async (state: string, loud: boolean) => {
      if (message || busy.current) return;
      if (tried.current.has(state)) {
        if (loud) setShake((s) => s + 1);
        return;
      }
      busy.current = true;
      const out = await open(sealed, state);
      busy.current = false;
      tried.current.add(state);
      setTries(tried.current.size);
      if (out !== null) {
        setMessage(out);
        navigator.vibrate?.([30, 40, 90]);
      } else if (loud) setShake((s) => s + 1);
    },
    [message, sealed],
  );

  // Every state the cube passes through is tried automatically, after it settles for a moment.
  useEffect(() => {
    const t = window.setTimeout(() => void attempt(facelets, false), 320);
    return () => window.clearTimeout(t);
  }, [facelets, attempt]);

  const applyRecipe = () => {
    const alg = recipe.replace(/[’`]/g, "'").trim();
    try {
      const c = new Cube();
      c.move(alg);
      resetVirtual(c.asString());
      void attempt(c.asString(), true);
    } catch {
      setShake((s) => s + 1);
    }
  };

  if (message !== null)
    return (
      <div className="flex flex-col items-center gap-4 pt-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--play-accent)] text-black play-glow">
          <Unlock size={28} />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--play-accent)]">Vault open</p>
        <div className="play-panel play-unlock w-full whitespace-pre-wrap rounded-2xl p-5 text-left text-[17px] leading-relaxed">{message}</div>
        <a href="/vault" className="text-[12px] font-semibold text-[var(--play-dim)] underline underline-offset-4">
          Seal one back
        </a>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div key={shake} className={cn("play-panel flex flex-col items-center gap-2 rounded-2xl p-5 text-center", shake > 0 && "play-shake")}>
        <VaultArt className="play-float h-36 w-full" />
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--play-accent)]">Sealed</p>
        {sealed.hint ? <p className="text-[15px] font-semibold">“{sealed.hint}”</p> : <p className="text-[13px] text-[var(--play-dim)]">No hint. You were told the state some other way — or you weren&apos;t.</p>}
        <p className="text-[11px] text-[var(--play-dim)]">
          {tries === 0 ? "Waiting for your cube" : `${tries} state${tries === 1 ? "" : "s"} tried`} · the lock never says how close you are
        </p>
      </div>
      <section className="play-panel flex flex-col gap-3 rounded-2xl p-4">
        <h2 className="text-[15px] font-bold tracking-tight">{connected ? "Twist your cube into the key" : "Twist the key"}</h2>
        <KeyNet facelets={facelets} />
        {!connected && <TurnPad onTurn={press} />}
        <div className="flex gap-2">
          <input
            value={recipe}
            onChange={(e) => setRecipe(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyRecipe()}
            placeholder={connected ? "…or type the scramble to check it" : "…or type the scramble you were given"}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12px] text-white outline-none placeholder:font-sans placeholder:text-white/25 focus:border-[var(--play-accent)]"
          />
          <button type="button" onClick={applyRecipe} disabled={!recipe.trim()} className="play-btn px-4 text-[12px]">
            Try
          </button>
        </div>
        <p className="text-[10.5px] leading-snug text-[var(--play-dim)]">
          Start from solved, white top, green front. Every state you pass through is tried the moment you stop turning.
        </p>
      </section>
    </div>
  );
}
