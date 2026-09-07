# Cube

A fast, aesthetic, local-first speedcubing timer for 3x3, built to be genuinely better than the timers already out there.

## Highlights

- **True WCA-legal scrambles** — random-*state* (not random-move) 3x3 scrambles, generated the same way official WCA scramblers do: pick a uniformly random valid cube state, solve it optimally, invert the solution.
- **Real timer UX** — WCA-style hold-to-arm spacebar timing, optional 15s inspection, millisecond precision, +2/DNF penalties, touch support for mobile.
- **Sessions & stats** — multiple sessions, full solve history, ao5/ao12/ao50/ao100 (WCA trimmed-mean rules), best/worst/mean, best-ever averages — all persisted locally (IndexedDB), no account or backend needed.
- **Hidden solve hints** — a "solve hints" reveal (off by default, so it's never visible mid-solve) shows:
  - The **optimal cross** (guaranteed shortest, computed with a full exact pruning table).
  - A **full CFOP solution** — cross, then all 4 F2L pairs (cheapest-first, keeping earlier work intact), then OLL, then PLL — computed from scratch via IDA* search against the actual cube engine, not a canned algorithm list. Every solution is verified to actually solve the cube before it's shown.
- A live 3D cube (via [cubing.js](https://github.com/cubing/cubing.js)'s `<twisty-player>`) can preview any hint.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Zustand for state, Dexie (IndexedDB) for local-first storage
- A vendored, trimmed copy of [`cubejs`](https://github.com/ldez/cubejs) (MIT) as the cube engine — see `src/lib/cube-engine/vendor/` for why it's vendored instead of an npm dependency
- All scrambling/solving runs in a Web Worker so the UI never blocks

## Solver architecture

The interesting part of this app is `src/lib/solvers/`:

- `cross.ts` — an *exact* pruning table (BFS from solved over all reachable cross-edge position+orientation combinations, ~190k states) gives a guaranteed-optimal cross (≤8 moves) via instant table lookup + greedy descent.
- `f2l.ts` — solves the 4 F2L pairs one at a time (cheapest-looking pair first) via IDA*, using per-pair pruning tables plus the cross/prior-pair tables as extra admissible heuristics so the search never wastes time on moves that would undo earlier work.
- `oll.ts` / `pll.ts` — orient, then permute, the last layer via IDA*, again keeping cross+F2L intact. For the rare pathologically-hard case that exceeds the search budget, both fall back to the engine's own two-phase solver for whatever remains — still always a valid, verified solve, just presented as one combined step instead of two.
- `idaStar.ts` — the shared IDA* implementation: per-iteration transposition table, opposite-face move canonicalization (R-then-L and L-then-R reach the same state, so only one order is explored), and a node budget so a search degrades to "try the next fallback" instead of hanging.

Pruning tables are precomputed at build time (`npm run gen:cross-table`, `npm run gen:piece-tables`) and committed as base64-encoded `Uint8Array`s — no runtime cost beyond decoding a small string.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest — solver correctness + stats tests
npm run build
```

To regenerate the solver pruning tables (only needed if you change the cube engine or table encoding):

```bash
npm run gen:cross-table
npm run gen:piece-tables
```
