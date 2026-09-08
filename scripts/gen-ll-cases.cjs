#!/usr/bin/env node
// Derives the complete OLL and PLL case sets from the cube group itself, then
// writes src/lib/algorithms/{ollData,pllData}.ts.
//
// Why generate rather than hand-maintain: a last-layer case is *defined* by a
// cube state, not by an algorithm, and a hand-written table can silently pair a
// name with an algorithm for a different case — or list one case twice under
// two names, with a redundant AUF hiding the duplication. Enumerating the state
// space makes both impossible. There are exactly 57 orientation classes and 21
// permutation classes, and this script gives each one exactly one entry.
//
// Everything here works in the traditional frame every published OLL and PLL
// algorithm is written in: first two layers on D, last layer on U, and D is
// never turned.
"use strict";

const fs = require("fs");
const path = require("path");
const Cube = require("../src/lib/cube-engine/vendor/index.js");

// U R F L B, the three slices, and the wide versions of those five faces —
// every turn that leaves the D layer alone. Published algorithms for the hard
// last-layer cases lean on M and r heavily, and a search restricted to outer
// faces has to spend three or four extra turns imitating them, so it looks for
// a fourteen-move answer where a nine-move one exists.
const MOVES = [
  { name: "U", index: 0 }, { name: "R", index: 1 }, { name: "F", index: 2 },
  { name: "L", index: 4 }, { name: "B", index: 5 },
  { name: "E", index: 6 }, { name: "M", index: 7 }, { name: "S", index: 8 },
  { name: "u", index: 12 }, { name: "r", index: 13 }, { name: "f", index: 14 },
  { name: "l", index: 16 }, { name: "b", index: 17 },
];
const LL_CORNERS = [0, 1, 2, 3]; // URF UFL ULB UBR
const LL_EDGES = [0, 1, 2, 3]; // UR UF UL UB
const F2L_CORNERS = [4, 5, 6, 7]; // DFR DLF DBL DRB
const F2L_EDGES = [4, 5, 6, 7]; // DR DF DL DB
const E_SLICE_EDGES = [8, 9, 10, 11]; // FR FL BL BR

const invertAlg = (alg) =>
  alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .map((m) => (m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`))
    .join(" ");

const moveCount = (alg) => alg.trim().split(/\s+/).filter(Boolean).length;

// ---------------------------------------------------------------------------
// Pruning tables (same BFS technique as gen-piece-tables.cjs, in this frame)
// ---------------------------------------------------------------------------
function buildTable(indexOf, size) {
  const dist = new Uint8Array(size).fill(255);
  const start = new Cube();
  dist[indexOf(start)] = 0;
  let frontier = [start];
  let depth = 0;
  while (frontier.length > 0) {
    const next = [];
    for (const state of frontier) {
      for (const move of MOVES) {
        for (let power = 0; power <= 2; power++) {
          const child = state.clone();
          for (let t = 0; t <= power; t++) child.multiply(Cube.moves[move.index]);
          const idx = indexOf(child);
          if (dist[idx] === 255) {
            dist[idx] = depth + 1;
            next.push(child);
          }
        }
      }
    }
    frontier = next;
    depth++;
  }
  return { dist, indexOf };
}

/** Distance table for the four bottom-layer edges, ignoring everything else. */
const bottomCross = buildTable((cube) => {
  let idx = 0;
  for (const id of F2L_EDGES) idx = idx * 12 + cube.ep.indexOf(id);
  for (const id of F2L_EDGES) idx = idx * 2 + cube.eo[cube.ep.indexOf(id)];
  return idx;
}, 12 ** 4 * 2 ** 4);

/** One table per F2L slot: its corner and its E-slice edge. */
const F2L_SLOTS = [
  { corner: 4, edge: 8 },
  { corner: 5, edge: 9 },
  { corner: 6, edge: 10 },
  { corner: 7, edge: 11 },
];
const slotTables = F2L_SLOTS.map((slot) =>
  buildTable((cube) => {
    const c = cube.cp.indexOf(slot.corner);
    const e = cube.ep.indexOf(slot.edge);
    return ((c * 3 + cube.co[c]) * 12 + e) * 2 + cube.eo[e];
  }, 8 * 3 * 12 * 2),
);

/** Orientation-only table for the last layer: 3^4 * 2^4 states. */
const orientation = buildTable((cube) => {
  let idx = 0;
  for (const s of LL_CORNERS) idx = idx * 3 + cube.co[s];
  for (const s of LL_EDGES) idx = idx * 2 + cube.eo[s];
  return idx;
}, 3 ** 4 * 2 ** 4);

/** Permutation table for the last layer's corners and edges. */
const llCorners = buildTable((cube) => {
  let idx = 0;
  for (const id of LL_CORNERS) idx = idx * 8 + cube.cp.indexOf(id);
  for (const id of LL_CORNERS) idx = idx * 3 + cube.co[cube.cp.indexOf(id)];
  return idx;
}, 8 ** 4 * 3 ** 4);
const llEdges = buildTable((cube) => {
  let idx = 0;
  for (const id of LL_EDGES) idx = idx * 12 + cube.ep.indexOf(id);
  for (const id of LL_EDGES) idx = idx * 2 + cube.eo[cube.ep.indexOf(id)];
  return idx;
}, 12 ** 4 * 2 ** 4);

const lookup = (t, cube) => t.dist[t.indexOf(cube)];

/** How far the first two layers are from being restored — 0 once they're intact. */
function f2lDistance(cube) {
  let h = lookup(bottomCross, cube);
  for (const t of slotTables) {
    const d = lookup(t, cube);
    if (d > h) h = d;
  }
  return h;
}

const ollHeuristic = (cube) => Math.max(lookup(orientation, cube), f2lDistance(cube));
const pllHeuristic = (cube) => Math.max(lookup(llCorners, cube), lookup(llEdges, cube), f2lDistance(cube));

// ---------------------------------------------------------------------------
// IDA* (a direct port of src/lib/solvers/idaStar.ts)
// ---------------------------------------------------------------------------
const moveLabel = (name, power) => name + (power === 1 ? "2" : power === 2 ? "'" : "");

function idaStar(start, { heuristic, isGoal, maxDepth, maxNodes }) {
  if (isGoal(start)) return [];
  let threshold = heuristic(start);
  const moves = [];
  const faceHistory = [];
  let nodes = 0;
  let seen = new Map();

  const keyOf = (c) => {
    let k = "";
    for (let i = 0; i < 8; i++) k += c.cp[i] * 3 + c.co[i] + ",";
    for (let i = 0; i < 12; i++) k += c.ep[i] * 2 + c.eo[i] + ",";
    return k;
  };

  function search(node, g, bound) {
    nodes++;
    if (nodes > maxNodes) return "BUDGET";
    const f = g + heuristic(node);
    if (f > bound) return f;
    if (isGoal(node)) return "FOUND";
    if (g >= maxDepth) return Infinity;

    const key = keyOf(node);
    const prev = seen.get(key);
    if (prev !== undefined && prev <= g) return Infinity;
    seen.set(key, g);

    let min = Infinity;
    const lastMove = faceHistory[faceHistory.length - 1];
    for (const move of MOVES) {
      // Two turns of the same layer in a row are always one turn in disguise.
      // With slices and wides in the set there is no longer a safe general
      // commutation rule, so this is the only pruning applied.
      if (move.index === lastMove) continue;
      for (let power = 0; power <= 2; power++) {
        const child = node.clone();
        for (let t = 0; t <= power; t++) child.multiply(Cube.moves[move.index]);
        moves.push(moveLabel(move.name, power));
        faceHistory.push(move.index);
        const result = search(child, g + 1, bound);
        if (result === "FOUND" || result === "BUDGET") return result;
        if (result < min) min = result;
        moves.pop();
        faceHistory.pop();
      }
    }
    return min;
  }

  for (let iter = 0; iter < 40; iter++) {
    seen = new Map();
    const result = search(start, 0, threshold);
    if (result === "FOUND") return [...moves];
    if (result === "BUDGET" || result === Infinity) return null;
    threshold = result;
    if (threshold > maxDepth) return null;
  }
  return null;
}

// A handful of cases need more than ten outer-layer turns, and an
// orientation-only heuristic gives IDA* almost nothing to go on past that
// depth — the search stops being worth waiting for long before it stops being
// possible. Beyond this bound the state goes to the engine's two-phase solver
// instead: not shortest, but immediate and always correct.
const SEARCH_TIERS = [
  { maxDepth: 9, maxNodes: 6_000_000 },
  { maxDepth: 12, maxNodes: 80_000_000 },
];

/** Kociemba depth limits to try, shortest first, once the exact search gives up. */
// Kociemba with a tight bound is an optimal-solver request and takes
// minutes; the default bound answers instantly, which is the point of a
// backstop.
const TWO_PHASE_DEPTHS = [20, 22];

function search(cube, heuristic, isGoal) {
  for (const tier of SEARCH_TIERS) {
    const moves = idaStar(cube, { heuristic, isGoal, ...tier });
    if (moves) return moves.join(" ");
  }
  return twoPhase(cube);
}

let solverReady = false;

/**
 * The engine's own solver, as the backstop. It returns a full solution to a
 * solved cube — which, for a state whose first two layers are already intact,
 * is by definition an algorithm that solves the case and leaves them intact.
 */
function twoPhase(cube) {
  if (!solverReady) {
    process.stdout.write("  initialising two-phase solver...");
    Cube.initSolver();
    solverReady = true;
    process.stdout.write(" done\n");
  }
  for (const depth of TWO_PHASE_DEPTHS) {
    let solution;
    try {
      solution = cube.clone().solve(depth);
    } catch {
      continue;
    }
    if (typeof solution !== "string") continue;
    const trimmed = solution.trim();
    const check = cube.clone();
    if (trimmed) check.move(trimmed);
    if (check.isSolved()) return trimmed;
  }
  return null;
}

const f2lIntact = (cube) => f2lDistance(cube) === 0;
const oriented = (cube) => LL_CORNERS.every((s) => cube.co[s] === 0) && LL_EDGES.every((s) => cube.eo[s] === 0);

const solveOll = (cube) => search(cube, ollHeuristic, (c) => oriented(c) && f2lIntact(c));
const solvePll = (cube) => search(cube, pllHeuristic, (c) => c.isSolved());

// ---------------------------------------------------------------------------
// Case classes
// ---------------------------------------------------------------------------
/** Rotates a per-slot array by n U turns, so patterns compare modulo AUF. */
function rotateSlots(arr, n) {
  const out = [...arr];
  for (let k = 0; k < n; k++) out.unshift(out.pop());
  return out;
}

/** OLL is orientation only, and an AUF just cycles which slot each piece is in. */
function ollClassKey(cube) {
  const co = LL_CORNERS.map((s) => cube.co[s]);
  const eo = LL_EDGES.map((s) => cube.eo[s]);
  return [0, 1, 2, 3].map((n) => [...rotateSlots(co, n), ...rotateSlots(eo, n)].join(",")).sort()[0];
}

/**
 * PLL is recognized modulo an AUF on *both* sides: one to line the case up and
 * one to finish, so the key minimizes over both.
 */
function pllClassKey(cube) {
  const cp = LL_CORNERS.map((s) => cube.cp[s]);
  const ep = LL_EDGES.map((s) => cube.ep[s]);
  const variants = [];
  for (let a = 0; a < 4; a++) {
    const relabel = rotateSlots([0, 1, 2, 3], a);
    for (let b = 0; b < 4; b++) {
      variants.push(
        rotateSlots(cp.map((v) => relabel[v]), b).join("") + "|" + rotateSlots(ep.map((v) => relabel[v]), b).join(""),
      );
    }
  }
  return variants.sort()[0];
}

/** The state an algorithm is meant to solve: undo it from solved. */
function caseStateFor(alg) {
  const cube = new Cube();
  cube.move(invertAlg(alg));
  return cube;
}

/** A last-layer algorithm has to leave the first two layers exactly as it found them. */
function lastLayerOnly(cube) {
  for (const s of F2L_CORNERS) if (cube.cp[s] !== s || cube.co[s] !== 0) return false;
  for (const s of [...F2L_EDGES, ...E_SLICE_EDGES]) if (cube.ep[s] !== s || cube.eo[s] !== 0) return false;
  return true;
}

const OLL_SOLVED_KEY = ollClassKey(new Cube());

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------
/** Every legal last-layer orientation: corner twists sum to 0 mod 3, flips are even. */
function* orientationStates() {
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++)
      for (let c = 0; c < 3; c++) {
        const d = (3 - ((a + b + c) % 3)) % 3;
        for (let p = 0; p < 2; p++)
          for (let q = 0; q < 2; q++)
            for (let r = 0; r < 2; r++) {
              const cube = new Cube();
              [a, b, c, d].forEach((v, i) => (cube.co[LL_CORNERS[i]] = v));
              [p, q, r, (p + q + r) % 2].forEach((v, i) => (cube.eo[LL_EDGES[i]] = v));
              yield cube;
            }
      }
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------
/**
 * The seven all-edges-oriented cases are the ones cubers name out loud, and
 * unlike the rest their names follow from the corner pattern alone. Each is
 * pinned by a well-known algorithm rather than a hand-typed pattern, so the
 * assignment is checked by construction: if two collided, or one landed outside
 * the family, the run fails.
 */
const OCLL_ANCHORS = [
  { name: "Sune", alg: "R U R' U R U2 R'" },
  { name: "Antisune", alg: "R U2 R' U' R U' R'" },
  { name: "H", alg: "R U R' U R U' R' U R U2 R'" },
  { name: "Pi", alg: "R U2 R2 U' R2 U' R2 U2 R" },
  // Not "R U R' U' R' F R F'" — that is the T *shape*, a two-edge case, and a
  // different animal from the all-edges-oriented T. The guard below catches the
  // mix-up, which is the reason these are pinned by algorithm at all.
  { name: "T", alg: "r U R' U' r' F R F'" },
  { name: "U", alg: "R2 D R' U2 R D' R' U2 R'" },
  { name: "L", alg: "F R' F' r U R U' r'" },
];

/** Dot, L Shape, Line or Cross — the split every recognition system starts from. */
function ollFamily(key) {
  const eo = key.split(",").slice(4).map(Number);
  const upFacing = eo.filter((v) => v === 0).length;
  if (upFacing === 0) return "Dot";
  if (upFacing === 4) return "Cross";
  const slots = eo.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  return (slots[1] - slots[0]) % 2 === 0 ? "Line" : "L Shape";
}

/**
 * PLL case classes. Unlike OLL, the standard names follow from each case's cycle
 * structure rather than from a published chart, so they are pinned here to the
 * permutation class itself — an algorithm can then only be filed under the case
 * it actually solves.
 */
const PLL_CLASSES = [
  ["Ua Perm", "0123|0312"], ["Ub Perm", "0123|0231"], ["H Perm", "0123|2301"], ["Z Perm", "0123|1032"],
  ["Aa Perm", "0132|3012"], ["Ab Perm", "0132|1230"], ["E Perm", "0321|1230"],
  ["T Perm", "0132|0321"], ["F Perm", "0132|2103"], ["Ja Perm", "0132|0132"], ["Jb Perm", "0132|3120"],
  ["Ra Perm", "0132|0213"], ["Rb Perm", "0132|1023"], ["V Perm", "0321|0132"], ["Y Perm", "0321|0213"],
  ["Na Perm", "0321|2103"], ["Nb Perm", "0321|0321"],
  ["Ga Perm", "0132|3201"], ["Gb Perm", "0132|2310"], ["Gc Perm", "0132|2031"], ["Gd Perm", "0132|1302"],
];

/**
 * The hand-written table's V Perm entry actually solved an Rb Perm, leaving the
 * V Perm class with no algorithm at all. This one is checked against its class
 * like every other.
 */
const EXTRA_PLL_ALGS = ["R' U R U' R' f' U' R U2 R' U' R U' R' f R"];

/**
 * Extra last-layer algorithms offered to the pool, filed under whichever case
 * each one actually solves. Nothing here is trusted: an entry that doesn't
 * preserve the first two layers is dropped, and one that solves a different
 * case than expected simply lands under that case instead. That makes the list
 * safe to extend freely — the only thing it can affect is whether a class gets
 * a human algorithm or a searched one.
 */
const EXTRA_OLL_ALGS = [
  "R U R' U' M' U R U' r'",
  "r U R' U' M2 U R U' R' U' M'",
  "M U R U R' U' M2 U R U' r'",
  "r U R' U R U2 r'",
  "r' U' R U' R' U2 r",
  "r U2 R' U' R U' r'",
  "r' U2 R U R' U r",
  "r U R' U R U2 R' U' R U R' U2 r'",
  "r' U' R U' R' U2 R U R' U' R U2 r",
  "R U R' U R U2 R' F R U R' U' F'",
  "R' U' R U' R' U2 R F R U R' U' F'",
  "F R U R' U' F'",
  "F U R U' R' F'",
  "F' U' L' U L F",
  "F' L' U' L U F",
  "R' U' F U R U' R' F' R",
  "R' U' R' F R F' U R",
  "S R U R' U' R' F R f'",
  "R U R2 U' R' F R U R U' F'",
  "F U R U' R2 F' R U R U' R'",
  "R' F R U R' F' R F U' F'",
  "r' U' r R' U' R U r' U r",
  "r U r' R U R' U' r U' r'",
  "R U R' U' R' F R2 U R' U' F'",
  "R U R' U R' F R F' R U2 R'",
  "r U R' U R' F R F' R U2 r'",
  "M' R' U' R U' R' U2 R U' M",
  "R U R' U' R U' R' F' U' F R U R'",
  "F R' F R2 U' R' U' R U R' F2",
  "r U R' U' r' R U R U' R'",
  "R U2 R' U' R U R' U' R U' R'",
  "F U R U' R' U R U' R' F'",
  "R U R' U R U' B U' B' R'",
  "r' U2 R U R' U' R U R' U r",
  "r U2 R' U' R U R' U' R U' r'",
  "R' F R U R U' R2 F' R2 U' R' U R U R'",
  "r U r' U R U' R' U R U' R' r U' r'",
  "R U R' U R U2 R' F R U R U' R' U' R U' R' F'",
  "L' B' L U' R' U R U' R' U R L' B L",
  "R U2 R2 F R F' R U2 R'",
  "F' L' U' L U L' U' L U F",
  "R' F R' F' R2 U2 B' R B R'",
  "R U R' U' R' F R2 U R' U' R U R' U' F'",
  "r' R2 U R' U R U2 R' U M'",
  "R U R' U R U2 R2 U' R U' R' U2 R",
  "l' U2 L U L' U l",
  "r U2 R' U' R U' r'",
  "l U2 L' U' L U' l'",
  "r' U2 R U R' U r",
];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
function readExistingAlgs(file) {
  const target = path.join(__dirname, "..", "src", "lib", "algorithms", file);
  if (!fs.existsSync(target)) return [];
  return [...fs.readFileSync(target, "utf8").matchAll(/alg:\s*"([^"]+)"/g)].map((m) => m[1]);
}

const flipDirection = (token) => (token.endsWith("2") ? token : token.endsWith("'") ? token.slice(0, -1) : `${token}'`);
const MIRROR_SWAP = { R: "L", L: "R", r: "l", l: "r" };

/**
 * Reflects an algorithm in the M plane — the "other-handed" version cubers
 * learn as a matter of course. A reflection reverses chirality, so every turn
 * direction flips as well as R swapping with L. The result is a real algorithm
 * for a different case, which is why it is worth generating: mirrors and
 * inverses between them cover eleven cases the hand-written table was missing,
 * with proper finger tricks rather than searched move soup.
 */
function mirrorAlg(alg) {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const base = token.replace(/['2]$/, "");
      const suffix = token.slice(base.length);
      return flipDirection((MIRROR_SWAP[base] ?? base) + suffix);
    })
    .join(" ");
}

/** Files each usable existing algorithm under the class it genuinely solves. */
function poolFrom(files, classKeyOf, extra = []) {
  const pool = new Map();
  const sourced = [...files.flatMap(readExistingAlgs), ...extra];
  // An algorithm's inverse and its mirror are algorithms too, for other cases.
  // Each is validated below like any other, so a transformation that doesn't
  // survive (one containing a rotation, say) is simply dropped.
  const candidates = [
    ...sourced,
    ...sourced.map(invertAlg),
    ...sourced.map(mirrorAlg),
    ...sourced.map((a) => mirrorAlg(invertAlg(a))),
  ];
  for (const alg of candidates) {
    let state;
    try {
      state = caseStateFor(alg);
    } catch {
      continue; // unparseable — ignore rather than trust
    }
    if (!lastLayerOnly(state)) continue;
    const key = classKeyOf(state);
    const current = pool.get(key);
    if (!current || moveCount(alg) < moveCount(current)) pool.set(key, alg);
  }
  return pool;
}

function buildOllCases() {
  const pool = poolFrom(["ollData.ts"], ollClassKey, EXTRA_OLL_ALGS);

  // One entry per class. Human algorithms have far better finger tricks than
  // searched ones, so a class that already has a real algorithm keeps it and is
  // never searched; only the genuinely missing classes cost a search.
  const byClass = new Map();
  const seen = new Set();
  let searched = 0;

  for (const state of orientationStates()) {
    const key = ollClassKey(state);
    if (key === OLL_SOLVED_KEY || seen.has(key)) continue;
    seen.add(key);

    const existing = pool.get(key);
    if (existing) {
      byClass.set(key, existing);
      continue;
    }
    const alg = solveOll(state.clone());
    if (alg === null) throw new Error(`no algorithm found for orientation class ${key}`);
    searched++;
    byClass.set(key, alg);
    console.log(`  searched ${key} -> ${alg}`);
  }

  console.log(`[OLL] ${byClass.size} classes; reused ${byClass.size - searched} existing, searched ${searched}`);
  if (byClass.size !== 57) throw new Error(`expected 57 OLL classes, found ${byClass.size}`);

  const anchors = new Map();
  for (const anchor of OCLL_ANCHORS) {
    const key = ollClassKey(caseStateFor(anchor.alg));
    if (ollFamily(key) !== "Cross") throw new Error(`OCLL anchor ${anchor.name} is not an all-edges-oriented case`);
    if (anchors.has(key)) throw new Error(`OCLL anchors ${anchors.get(key).name} and ${anchor.name} are the same case`);
    if (!byClass.has(key)) throw new Error(`OCLL anchor ${anchor.name} landed outside the enumerated classes`);
    anchors.set(key, anchor);
    byClass.set(key, anchor.alg);
  }
  if (anchors.size !== 7) throw new Error(`expected 7 distinct OCLL anchors, got ${anchors.size}`);

  const families = new Map();
  for (const key of [...byClass.keys()].sort()) {
    families.set(ollFamily(key), [...(families.get(ollFamily(key)) ?? []), key]);
  }

  const cases = [];
  for (const family of ["Dot", "L Shape", "Line", "Cross"]) {
    (families.get(family) ?? []).forEach((key, i) => {
      const anchor = anchors.get(key);
      const name = anchor ? anchor.name : `${family} ${i + 1}`;
      cases.push({
        id: `oll-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        group: "OLL",
        alg: byClass.get(key),
        shape: family,
      });
    });
  }
  return cases;
}

function buildPllCases() {
  const pool = poolFrom(["pllData.ts"], pllClassKey, EXTRA_PLL_ALGS);
  return PLL_CLASSES.map(([name, key]) => {
    let alg = pool.get(key);
    if (!alg) {
      // No algorithm on hand for this class — derive one.
      const state = stateForPllClass(key);
      alg = solvePll(state);
      if (!alg) throw new Error(`no algorithm found for ${name} (class ${key})`);
      console.log(`  searched ${name} -> ${alg}`);
    }
    return {
      id: `pll-${name.split(" ")[0].toLowerCase()}`,
      name,
      group: "PLL",
      alg,
      shape: name.startsWith("G") ? "G Perm" : undefined,
    };
  });
}

/** Rebuilds a cube in the given permutation class, for the rare unseeded case. */
function stateForPllClass(key) {
  const [cpPart, epPart] = key.split("|");
  const cube = new Cube();
  [...cpPart].forEach((v, i) => (cube.cp[LL_CORNERS[i]] = Number(v)));
  [...epPart].forEach((v, i) => (cube.ep[LL_EDGES[i]] = Number(v)));
  return cube;
}

function writeFile(file, constName, cases, header) {
  const body = cases
    .map((c) => {
      const shape = c.shape ? `, shape: "${c.shape}"` : "";
      return `  { id: "${c.id}", name: "${c.name}", group: "${c.group}", alg: "${c.alg}"${shape} },`;
    })
    .join("\n");
  const contents = `${header.join("\n")}\nimport type { AlgCase } from "./types";\n\nexport const ${constName}: AlgCase[] = [\n${body}\n];\n`;
  const outPath = path.join(__dirname, "..", "src", "lib", "algorithms", file);
  fs.writeFileSync(outPath, contents);
  console.log(`Wrote ${outPath} (${cases.length} cases)`);
}

function main() {
  const ollCases = buildOllCases();
  const pllCases = buildPllCases();
  if (pllCases.length !== 21) throw new Error(`expected 21 PLL cases, built ${pllCases.length}`);

  writeFile("ollData.ts", "OLL_CASES", ollCases, [
    "// AUTO-GENERATED by scripts/gen-ll-cases.cjs. Do not edit by hand.",
    "//",
    "// The 57 orientation classes of the last layer, enumerated from the cube",
    "// group so that every case appears exactly once. Names are shape-family",
    "// labels (Dot / L Shape / Line / Cross) rather than the conventional 1-57",
    "// chart numbering, which is a published convention this app has no source",
    "// for; the seven all-edges-oriented cases keep the names cubers actually",
    "// say. Algorithms are written in the traditional last-layer-on-U frame.",
  ]);
  writeFile("pllData.ts", "PLL_CASES", pllCases, [
    "// AUTO-GENERATED by scripts/gen-ll-cases.cjs. Do not edit by hand.",
    "//",
    "// The 21 permutation classes of the last layer. Unlike OLL, the standard",
    "// names follow from each case's cycle structure, so each name is pinned to",
    "// its permutation class and algorithms are filed under the case they",
    "// actually solve. Written in the traditional last-layer-on-U frame.",
  ]);
}

main();
