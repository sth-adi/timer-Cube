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
}

declare const Cube: CubeJSStatic;
export default Cube;
