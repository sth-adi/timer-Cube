export type AlgGroup = "PLL" | "OLL";

export interface AlgCase {
  id: string;
  name: string;
  group: AlgGroup;
  /** Move notation, applied on top of an already cross+F2L(+oriented, for PLL)-solved cube. */
  alg: string;
  /** Descriptive shape family, mainly useful for OLL browsing (e.g. "Dot", "Cross", "Fish"). */
  shape?: string;
}
