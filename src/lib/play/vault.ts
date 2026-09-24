/**
 * Cube Vault: a message encrypted with a physical cube *state* as the key.
 *
 * The key is never a password you type — it's the arrangement of the 54
 * stickers. Whoever holds a smart cube can only read the message by
 * twisting it into that exact position; any sequence that reaches the
 * state works, and no sequence that doesn't can. A random state is ~65
 * bits (4.3×10¹⁹ positions); a short hand-picked sequence is less, and
 * the strength meter says how much.
 *
 * AES-256-GCM, key from PBKDF2-SHA256 over the facelet string with a
 * random salt, all through WebCrypto — nothing leaves the device; the
 * sealed message lives entirely in the share link's #fragment, which
 * browsers never send to a server.
 */

const VERSION = 1;
const ITERATIONS = 120_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface Sealed {
  salt: Uint8Array;
  iv: Uint8Array;
  data: Uint8Array;
  /** Optional hint the sender chose to leave in the clear. */
  hint: string;
}

async function deriveKey(facelets: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(facelets), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function seal(message: string, facelets: string, hint = ""): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(facelets, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(message)));
  return { salt, iv, data, hint };
}

/** The message, or null if this cube state isn't the key. */
export async function open(sealed: Sealed, facelets: string): Promise<string | null> {
  try {
    const key = await deriveKey(facelets, sealed.salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv as BufferSource }, key, sealed.data as BufferSource);
    return dec.decode(plain);
  } catch {
    return null;
  }
}

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** Packs a sealed message into a URL-safe token: v.salt.iv.data.hint. */
export function encodeSealed(s: Sealed): string {
  return [VERSION, toB64Url(s.salt), toB64Url(s.iv), toB64Url(s.data), toB64Url(enc.encode(s.hint))].join(".");
}

export function decodeSealed(token: string): Sealed | null {
  const parts = token.split(".");
  if (parts.length !== 5 || Number(parts[0]) !== VERSION) return null;
  try {
    const [, salt, iv, data, hint] = parts;
    const out = { salt: fromB64Url(salt), iv: fromB64Url(iv), data: fromB64Url(data), hint: dec.decode(fromB64Url(hint)) };
    if (out.salt.length !== 16 || out.iv.length !== 12 || out.data.length < 17) return null;
    return out;
  } catch {
    return null;
  }
}

/**
 * Rough key strength in bits for a state reached by `moves` face turns
 * from solved: each turn after the first picks one of 15 (5 other faces ×
 * 3 amounts after pruning), capped at the ~65 bits of all cube states.
 */
export function strengthBits(moveCount: number): number {
  if (moveCount <= 0) return 0;
  return Math.min(65.2, Math.log2(18) + (moveCount - 1) * Math.log2(13.35));
}

export function strengthLabel(bits: number): "none" | "toy" | "fair" | "strong" | "max" {
  if (bits <= 0) return "none";
  if (bits < 24) return "toy";
  if (bits < 45) return "fair";
  if (bits < 64) return "strong";
  return "max";
}
