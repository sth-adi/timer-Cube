/**
 * Which physical cube a solve was made on. A smart cube's Bluetooth MAC is
 * the only truly unique thing it reports, but not every protocol resolves
 * one — then the advertised name stands in (two cubes of the same model
 * without a MAC are indistinguishable, and will share an entry).
 */
export interface CubeIdentity {
  id: string;
  /** The name the cube advertises, e.g. "GAN12 ui". */
  name: string;
  protocol?: string;
}

export function cubeIdentity(opts: { deviceMac: string | null; deviceName: string | null; protocolName: string | null }): CubeIdentity | null {
  const name = opts.deviceName?.trim();
  if (!name) return null;
  const mac = opts.deviceMac?.trim().toUpperCase();
  return { id: mac ? `mac:${mac}` : `name:${name}`, name, ...(opts.protocolName ? { protocol: opts.protocolName } : {}) };
}
