/** Decodes a base64 string into a Uint8Array, in both browser and Node. */
export function decodeBase64Table(b64: string, expectedLength: number): Uint8Array {
  let bytes: Uint8Array;
  if (typeof atob === "function") {
    const binary = atob(b64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    bytes = new Uint8Array(Buffer.from(b64, "base64"));
  }
  if (bytes.length !== expectedLength) {
    throw new Error(`Decoded table length ${bytes.length} !== expected ${expectedLength}`);
  }
  return bytes;
}
