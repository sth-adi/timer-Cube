// Type declarations for the vendored cubejs engine (see index.js).
// Cubie ordering (Kociemba convention), used throughout our solver code:
//   Faces:   U=0 R=1 F=2 D=3 L=4 B=5
//   Corners: URF=0 UFL=1 ULB=2 UBR=3 DFR=4 DLF=5 DBL=6 DRB=7
//   Edges:   UR=0 UF=1 UL=2 UB=3 DR=4 DF=5 DL=6 DB=7 FR=8 FL=9 BL=10 BR=11

export interface CubeJSInstance {
  center: number[];
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
  init(other: CubeJSInstance): void;
  identity(): void;
  toJSON(): unknown;
  asString(): string;
  clone(): CubeJSInstance;
  isSolved(): boolean;
  centerMultiply(other: CubeJSInstance): void;
  cornerMultiply(other: CubeJSInstance): void;
  edgeMultiply(other: CubeJSInstance): void;
  multiply(other: CubeJSInstance): void;
  move(arg: string | number[]): CubeJSInstance;
  upright(): string;
  randomize(): CubeJSInstance;
  /** Optimal-ish (two-phase / Kociemba) solution. Requires Cube.initSolver() first. */
  solve(maxDepth?: number): string;
}

export interface CubeJSStatic {
  new (other?: CubeJSInstance): CubeJSInstance;
  moves: CubeJSInstance[];
  fromString(str: string): CubeJSInstance;
  initSolver(): void;
  random(): CubeJSInstance;
  /** WCA-legal random-*state* scramble (random valid state, solved & inverted). */
  scramble(): string;
  inverse(arg: string): string;
  /**
   * Two-phase solver move tables, keyed by coordinate name (see
   * vendor/solve.js). `initSolver()` computes any entry still `null`; a
   * value of `number[][]` is what it computes, `Int16Array[]` is what
   * loadPrecomputedSolverTables.ts substitutes instead (row-major views into
   * one precomputed buffer — see that file for why).
   */
  moveTables: Record<string, number[][] | Int16Array[] | null>;
  /**
   * Two-phase solver pruning tables (4-bit distances packed 8-per-32-bit
   * word — see vendor/solve.js's `pruning()` helper), keyed by name.
   * `number[]` is what `initSolver()` computes; `Uint32Array` is what
   * loadPrecomputedSolverTables.ts substitutes instead — bitwise ops on it
   * behave identically, so nothing that reads/writes these tables needs to
   * change based on which one is present.
   */
  pruningTables: Record<string, number[] | Uint32Array | null>;
}

declare const Cube: CubeJSStatic;
export default Cube;
