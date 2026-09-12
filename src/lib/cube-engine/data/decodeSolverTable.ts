function decodeBase64Bytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Decodes a base64 blob of packed Int16 values (little-endian), in both browser and Node. */
export function decodeInt16Table(b64: string, expectedLength: number): Int16Array {
  const bytes = decodeBase64Bytes(b64);
  const table = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  if (table.length !== expectedLength) {
    throw new Error(`Decoded Int16 table length ${table.length} !== expected ${expectedLength}`);
  }
  return table;
}

/** Decodes a base64 blob of packed Uint32 values (little-endian), in both browser and Node. */
export function decodeUint32Table(b64: string, expectedLength: number): Uint32Array {
  const bytes = decodeBase64Bytes(b64);
  const table = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  if (table.length !== expectedLength) {
    throw new Error(`Decoded Uint32 table length ${table.length} !== expected ${expectedLength}`);
  }
  return table;
}
