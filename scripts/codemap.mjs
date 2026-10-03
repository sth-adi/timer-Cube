#!/usr/bin/env node
// Regenerates docs/codemap/graph.json and docs/codemap/MAP.md from src/**/*.{ts,tsx}.
// Run: npm run codemap   (no dependencies beyond the already-installed `typescript`)
//
// Output is deterministic (sorted, no timestamps) so diffs stay small.
// Tune the AREA_RULES / AREA_CAP below if the map groups things badly.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OUT_DIR = path.join(ROOT, "docs", "codemap");
const AREA_CAP = 12; // max files listed per area in MAP.md (rest summarised as "and N more")
const SUMMARY_MAX = 140;
const EXPORTS_SHOWN = 6; // exports shown per line in MAP.md

// ---------------------------------------------------------------- walk
const posix = (p) => p.split(path.sep).join("/");
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name) && !/\.test\.(ts|tsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}
const files = walk(SRC).map((f) => posix(path.relative(ROOT, f))).sort();
const fileSet = new Set(files);

// Which files have a sibling test (we skip tests, but record that one exists).
const testBases = new Set();
(function collectTests(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectTests(full);
    else if (/\.test\.(ts|tsx)$/.test(ent.name)) {
      testBases.add(posix(path.relative(ROOT, full)).replace(/\.test\.(ts|tsx)$/, ""));
    }
  }
})(SRC);

// ---------------------------------------------------------------- resolve
function tryResolve(base) {
  const stripped = base.replace(/\.(js|jsx|mjs)$/, "");
  const cands = [base, stripped + ".ts", stripped + ".tsx", base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"];
  for (const c of cands) if (fileSet.has(c)) return c;
  return null;
}
function resolveSpec(from, spec) {
  if (spec.startsWith("@/")) return tryResolve("src/" + spec.slice(2));
  if (spec.startsWith(".")) return tryResolve(path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)));
  return null;
}

// ---------------------------------------------------------------- parse
function firstSentence(raw) {
  const lines = raw
    .replace(/^\/\*+/, "")
    .replace(/\*+\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*?\s?/, "").replace(/^\/\/\s?/, "").trim());
  const kept = [];
  for (const l of lines) {
    if (l.startsWith("@")) break;
    if (!l) {
      if (kept.length) break; // first paragraph only
      continue;
    }
    kept.push(l);
  }
  let text = kept.join(" ").replace(/\s+/g, " ").replace(/`/g, "").trim();
  const m = /(?<!\be\.g|\bi\.e|\betc|\bvs|\bcf)\.(\s|$)/.exec(text);
  if (m) text = text.slice(0, m.index + 1);
  if (text.length > SUMMARY_MAX) text = text.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, "") + "…";
  return text.replace(/\|/g, "/");
}

/** Leading comments directly attached to a node (JSDoc/block, or a run of // lines). */
function leadingComment(text, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) || [];
  if (!ranges.length) return "";
  const last = ranges[ranges.length - 1];
  if (last.kind === ts.SyntaxKind.MultiLineCommentTrivia) return text.slice(last.pos, last.end);
  // contiguous // run immediately above the node
  const run = [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    if (r.kind !== ts.SyntaxKind.SingleLineCommentTrivia) break;
    if (i < ranges.length - 1 && text.slice(r.end, ranges[i + 1].pos).split("\n").length > 2) break;
    run.unshift(text.slice(r.pos, r.end));
  }
  return run.join("\n");
}

const hasMod = (node, kind) => !!node.modifiers?.some((m) => m.kind === kind);

function analyse(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specs = new Set();
  const exports = [];
  const exportDocs = []; // [{ name, doc }] for exports that carry a comment
  let headerDoc = "";

  // File header: a comment at position 0 that is not just the first export's own doc.
  const lead = ts.getLeadingCommentRanges(text, 0) || [];
  const stmts = sf.statements;
  if (lead.length && stmts.length) {
    const r = lead[0];
    const first = stmts[0];
    const afterGap = text.slice(r.end, first.getStart()).includes("\n\n");
    const isExportFirst = hasMod(first, ts.SyntaxKind.ExportKeyword);
    if (r.kind === ts.SyntaxKind.MultiLineCommentTrivia && (afterGap || !isExportFirst)) headerDoc = text.slice(r.pos, r.end);
    else if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia && afterGap) headerDoc = text.slice(r.pos, r.end);
  }

  const addExport = (name, stmt) => {
    exports.push(name);
    const doc = leadingComment(text, stmt);
    if (doc && !exportDocs.some((d) => d.doc === doc)) exportDocs.push({ name, doc });
  };

  for (const st of stmts) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) specs.add(st.moduleSpecifier.text);
    else if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) specs.add(st.moduleSpecifier.text);
      if (st.exportClause && ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) addExport(e.name.text, st);
      else if (!st.exportClause) addExport("*", st);
    } else if (ts.isExportAssignment(st)) addExport("default", st);
    else if (hasMod(st, ts.SyntaxKind.ExportKeyword)) {
      const isDefault = hasMod(st, ts.SyntaxKind.DefaultKeyword);
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) addExport(d.name.text, st);
      } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) addExport(isDefault ? "default" : st.name.text, st);
      else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) addExport("default", st);
      else if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) addExport(st.name.text, st);
    }
  }

  // dynamic import("…") and new URL("./worker", import.meta.url)
  (function visit(n) {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) specs.add(n.arguments[0].text);
    else if (
      ts.isNewExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "URL" &&
      n.arguments?.length === 2 &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      n.arguments[1].getText(sf) === "import.meta.url" &&
      n.arguments[0].text.startsWith(".")
    )
      specs.add(n.arguments[0].text);
    ts.forEachChild(n, visit);
  })(sf);

  // Header comment wins; else the first export's own doc; else the export named like the file
  // (useFooStore for fooStore.ts); else the first documented non-test export, labelled by name.
  const stem = path.posix.basename(rel).replace(/\.(ts|tsx)$/, "").toLowerCase();
  const named = exportDocs.find((d) => d.name !== "*" && (d.name.toLowerCase().includes(stem) || stem.includes(d.name.toLowerCase())));
  const isTestOnly = (d) => /^\W*test-only/i.test(d.doc.replace(/^\/\*+|^\/\/|\*/g, "").trim());
  const firstDoc = exportDocs[0]?.name === exports[0] && !isTestOnly(exportDocs[0]) ? exportDocs[0] : undefined;
  const pick = firstDoc ?? named ?? exportDocs.find((d) => !isTestOnly(d));
  const docRaw = headerDoc || pick?.doc || "";
  // A doc borrowed from a later export is labelled with that export's name so it isn't misread as the file's purpose.
  const prefix = !headerDoc && pick && pick !== firstDoc ? `${pick.name}: ` : "";
  let summary = docRaw ? firstSentence(docRaw) : "";
  if (summary && prefix) summary = (prefix + summary).length > SUMMARY_MAX ? (prefix + summary).slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, "") + "…" : prefix + summary;
  const loc = text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  return { specs: [...specs], exports: [...new Set(exports)].sort(), summary, loc };
}

// ---------------------------------------------------------------- kind
function kindOf(id) {
  const base = path.posix.basename(id);
  if (/^worker\.tsx?$/.test(base) || /\.worker\.tsx?$/.test(base)) return "worker";
  if (id.startsWith("src/app/")) return base === "page.tsx" ? "page" : "route";
  if (id.startsWith("src/hooks/") || /^use[A-Z]/.test(base)) return "hook";
  if (id.startsWith("src/lib/store/")) return "store";
  if (id.startsWith("src/components/")) return "component";
  return "lib";
}

// ---------------------------------------------------------------- areas
const AREAS = [
  "Timer",
  "Smart cube",
  "Sessions & solves",
  "Stats",
  "Analysis / X-Ray",
  "Trainer / Algorithms",
  "Sync & offline",
  "Settings",
  "Lab / Play",
  "Shared UI / FX",
  "Cube engine & solvers",
  "Other",
];
const R = (area, re) => ({ area, re: new RegExp(re) });
// First match wins. Paths are repo-relative ids.
const AREA_RULES = [
  // Sync & offline (before generic db / store rules)
  R("Sync & offline", "^src/lib/db/(sync|cloudSync|merge|chunkBySize)\\.ts$|^src/lib/(supabase|auth|offline|live)/|^src/lib/store/(syncStore|cloudSyncStore|offlineStore|authStore)\\.ts$|^src/app/offline/|^src/components/chrome/(ConnectionPill|SyncedSessionNotice|OnlinePresenceBadge)\\.tsx$"),
  R("Settings", "^src/components/settings/|^src/lib/store/settingsStore\\.ts$|^src/app/settings/"),
  // Smart cube (BLE pipeline, gestures, guided solving, rewind)
  R("Smart cube", "^src/lib/smartcube/|^src/components/smartcube/|^src/lib/store/(smartCube\\w*|scrambleGuideStore|freestyleStore|gyroStore|heartRateStore)\\.ts$|^src/hooks/(useSmartCubeFlow|useCubeGestures|useCubeSetup|useFreestyle|useScrambleGuide|useScrambleVoice|useVoiceCoach)\\.ts$|^src/lib/(gyro|satnav|gaze)/|^src/components/(satnav|timemachine|gaze)/|^src/app/(satnav|timemachine)/|^src/lib/utils/bleHeartRate\\.ts$"),
  // Timer
  R("Timer", "^src/components/(timer|inspection|scramble)/|^src/hooks/(useTimer|useTimerInput|useSolveCompletion|useSplitPacer|useWakeLock|useNowTick)\\.ts$|^src/lib/(timer|inspection|scramble)/|^src/lib/store/scrambleStore\\.ts$|^src/app/(page|inspection/)"),
  // Sessions & solves
  R("Sessions & solves", "^src/lib/db/|^src/lib/sessions/|^src/lib/backup/|^src/lib/store/sessionStore\\.ts$|^src/components/sessions/|^src/app/(solves|solve)/|^src/types/|^src/lib/utils/(sessionExport|csTimerImport|time)\\.ts$"),
  // Stats
  R("Stats", "^src/(components|lib)/(stats|analytics|recap|wrapped|usage|share)/|^src/lib/store/recapStore\\.ts$|^src/app/(progress|consistency|luck|stamina|economy|stalls|archetypes|momentum|wrapped|goal|cadence|tempo)/"),
  // Analysis / X-Ray
  R("Analysis / X-Ray", "^src/(components|lib)/(analysis|xray|pausemap|blindspots|replay)/|^src/lib/store/analysisStore\\.ts$|^src/app/(xray|autopsy|bottleneck|mistakes|blindspots|lookahead|coldstart|multislot)/"),
  // Trainer / Algorithms
  R("Trainer / Algorithms", "^src/(components|lib)/(algorithms|trainer|drills|bld|blindcross|xcross|auf|duel|comp|gym|social|rotations)/|^src/lib/store/(trainerStore|algorithmStore|algIdStore|myAlgsStore|crossDrillStore|blindCrossStore|xcrossStore|mistakeDrillStore|pauseDrillStore|dailyChallengeStore|raceStore|roomStore|duelStore|compStore|gymStore|weaknessStore|performanceAuraBus)\\w*\\.ts$|^src/app/(algid|algspeed|bld|blindcross|cases|coach|comp|duel|eventmix|f2lcases|gym|myalgs|auf|xcross|rotations|crosscolor)/"),
  // Lab / Play
  R("Lab / Play", "^src/(components|lib)/(play|lab|reel|rhythm|pacer|tempo|ar|rematch|quests|journey|experiments)/|^src/lib/store/(questStore|journeyStore|experimentStore|pacerStore)\\.ts$|^src/app/(lab|play|golf|maze|twistris|echo|vault|wake|portraits|rhythm|pacer|reel|rematch|ar|spin|tilt|sob|quests|journey|experiments)/"),
  // Cube engine
  R("Cube engine & solvers", "^src/lib/(cube-engine|solvers)/"),
  // Shared UI / FX
  R("Shared UI / FX", "^src/components/(chrome|nav)/|^src/lib/(fx|utils)/|^src/lib/store/navigationStore\\.ts$|^src/components/AppBootstrap\\.tsx$|^src/hooks/useNow\\.ts$|^src/app/[^/]+\\.(tsx|ts)$"),
];
const areaOf = (id) => AREA_RULES.find((r) => r.re.test(id))?.area ?? "Other";

// ---------------------------------------------------------------- build graph
const analysed = new Map();
for (const f of files) analysed.set(f, analyse(f));

const edgeSet = new Set();
for (const f of files) {
  for (const s of analysed.get(f).specs) {
    const to = resolveSpec(f, s);
    if (to && to !== f) edgeSet.add(`${f}\u0000${to}`);
  }
}
const edges = [...edgeSet]
  .map((k) => {
    const [from, to] = k.split("\u0000");
    return { from, to };
  })
  .sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.to < y.to ? -1 : x.to > y.to ? 1 : 0));

const importedBy = new Map(files.map((f) => [f, 0]));
const imports = new Map(files.map((f) => [f, []]));
for (const e of edges) {
  importedBy.set(e.to, importedBy.get(e.to) + 1);
  imports.get(e.from).push(e.to);
}

// Routes: URL -> page file
const routes = {};
for (const f of files) {
  const m = /^src\/app\/(.*)page\.tsx$/.exec(f);
  if (!m) continue;
  const segs = m[1].split("/").filter(Boolean).filter((s) => !/^\(.*\)$/.test(s)); // drop (route groups)
  routes["/" + segs.join("/")] = f;
}
const routeEntries = Object.entries(routes).sort(([a], [b]) => (a < b ? -1 : 1));

// Page areas: explicit rule match, else the area most of its direct imports live in.
const nodeArea = new Map();
for (const f of files) if (kindOf(f) !== "page") nodeArea.set(f, areaOf(f));
for (const f of files) {
  if (kindOf(f) !== "page") continue;
  const rule = AREA_RULES.find((r) => r.re.test(f));
  if (rule) {
    nodeArea.set(f, rule.area);
    continue;
  }
  const votes = new Map();
  for (const t of imports.get(f)) {
    const a = nodeArea.get(t) ?? areaOf(t);
    if (a === "Shared UI / FX" || a === "Other" || a === "Cube engine & solvers") continue;
    votes.set(a, (votes.get(a) ?? 0) + 1);
  }
  const best = [...votes.entries()].sort((x, y) => y[1] - x[1] || AREAS.indexOf(x[0]) - AREAS.indexOf(y[0]))[0];
  nodeArea.set(f, best ? best[0] : "Other");
}

const nodes = files.map((f) => {
  const a = analysed.get(f);
  return {
    id: f,
    kind: kindOf(f),
    area: nodeArea.get(f),
    exports: a.exports,
    summary: a.summary,
    loc: a.loc,
    importedBy: importedBy.get(f),
    hasTest: testBases.has(f.replace(/\.(ts|tsx)$/, "")),
  };
});

// ---------------------------------------------------------------- write graph.json
// One node / edge per line: still plain JSON, but small, line-oriented diffs.
const j = JSON.stringify;
const graphJson =
  "{\n" +
  `  "about": "Generated by scripts/codemap.mjs (npm run codemap). Do not edit. nodes: one per src/**/*.{ts,tsx} excluding tests; edges: internal imports (from imports to); routes: URL -> page file; importedBy: count of distinct importing files; hasTest: a sibling *.test.ts(x) exists.",\n` +
  `  "nodes": [\n${nodes.map((n) => "    " + j(n)).join(",\n")}\n  ],\n` +
  `  "edges": [\n${edges.map((e) => "    " + j(e)).join(",\n")}\n  ],\n` +
  `  "routes": {\n${routeEntries.map(([u, f]) => `    ${j(u)}: ${j(f)}`).join(",\n")}\n  }\n}\n`;
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "graph.json"), graphJson);

// ---------------------------------------------------------------- MAP.md
const HEADER = `# Code map — timer-Cube

Generated by \`npm run codemap\` (scripts/codemap.mjs); the header text lives in the script. Full import graph: \`docs/codemap/graph.json\`
(nodes[{id,kind,area,exports,summary,loc,importedBy,hasTest}], edges[{from,to}], routes{url:file}).

## How to use
- Find the area below, then open the 1-3 files named. Files are ordered most-imported first, so the top lines are each area's shared core.
- Line format: \`path [importedBy] — summary (exports…)\`. Tests are not listed (\`x.test.ts\` sits beside \`x.ts\`).
- Importers of X: \`node -e 'const g=require("./docs/codemap/graph.json");console.log(g.edges.filter(e=>e.to==="src/lib/store/sessionStore.ts").map(e=>e.from).join("\\n"))'\`; swap \`e.to\`/\`e.from\` for "what does X import?".
- Pages live at \`src/app/<url>/page.tsx\` and are thin: they mount a \`src/components/*\` view over a \`src/lib/*\` module.
- Conventions: \`src/lib/store/*\` = Zustand stores (\`use…Store\`); \`src/lib/<feature>/\` = pure logic with sibling tests; \`src/components/<feature>/\` = React UI; \`src/hooks/\` = cross-feature hooks.
- This Next.js has breaking changes: read \`node_modules/next/dist/docs/\` before touching routing/config (AGENTS.md).

## Main data flow
- **Local DB first**: Dexie (IndexedDB) \`lib/db/db.ts\` + \`db/solves.ts\`, \`db/sessions.ts\` -> Zustand stores in \`lib/store/\` (\`sessionStore\` is the hub, \`settingsStore\` holds prefs) -> components. Stats/analysis are pure functions over \`Solve[]\` (\`lib/stats\`, \`lib/analysis\`, \`lib/analytics\`).
- **Solve lifecycle**: \`lib/timer/timerMachine\` + \`useTimerInput\` (keyboard) or \`useSmartCubeFlow\` (cube) -> \`useSolveCompletion\` -> \`sessionStore.addSolve\` -> Dexie -> PB/achievement toasts, stats, cloud push.
- **Sync (two paths, one rule)**: cloud = Supabase \`db/cloudSync.ts\` (\`pullAll\` / \`pushAll\` / \`syncWithCloud\`, driven by \`cloudSyncStore\`); device-to-device = WebRTC \`store/syncStore.ts\` + \`db/sync.ts\`. Both merge through \`db/merge.ts\`: per id the most recent event wins (row \`updatedAt\` vs deletion \`deletedAt\`); ties are deterministic (a deletion beats a same-instant edit, else content order); deleting a session deletes its solves.
- **Smart-cube Bluetooth**: \`smartcube-web-bluetooth\` -> \`store/smartCubeStore\` (connect, decode moves/facelets; \`lib/smartcube/turnRepair\`, \`stateSync\`) -> \`store/smartCubeBus\` (high-frequency raw moves + gyro, deliberately not Zustand) -> \`hooks/useSmartCubeFlow\` (scramble match, inspection, solve) -> \`SmartCubeTimer\`. Per-turn data feeds \`lib/analysis\` (phases, X-Ray) and guided features (Sat-Nav, Time Machine via \`smartcube/route.ts\`).
- **Service worker / offline**: \`public/sw.js\` (hashed assets cache-first, pages network-first with timeout, cache "warm") is registered by \`store/offlineStore.ts\`; \`lib/offline/routes.ts\` lists every static page to pre-cache (a test fails when a new page is missing); offline solves stay in Dexie and sync later.
- **Workers**: \`lib/cube-engine/worker.ts\` (solver/scrambles), \`lib/xray/worker.ts\`, \`lib/satnav/worker.ts\`, each wrapped by that folder's \`client.ts\`.

## Areas`;

function fileLine(n) {
  const ex = n.exports.length
    ? ` (${n.exports.slice(0, EXPORTS_SHOWN).join(", ")}${n.exports.length > EXPORTS_SHOWN ? `, +${n.exports.length - EXPORTS_SHOWN}` : ""})`
    : "";
  return `- ${n.id} [${n.importedBy}] —${n.summary ? " " + n.summary : ""}${ex}`;
}

const lines = [HEADER, ""];
const byArea = new Map(AREAS.map((a) => [a, []]));
for (const n of nodes) if (n.kind !== "page") byArea.get(n.area).push(n);

for (const area of AREAS) {
  const list = byArea.get(area).sort((a, b) => b.importedBy - a.importedBy || (a.id < b.id ? -1 : 1));
  const pageCount = nodes.filter((n) => n.kind === "page" && n.area === area).length;
  if (!list.length && !pageCount) continue;
  lines.push(`### ${area} — ${list.length} files${pageCount ? `, ${pageCount} pages` : ""}`);
  for (const n of list.slice(0, AREA_CAP)) lines.push(fileLine(n));
  if (list.length > AREA_CAP) {
    const rest = list.slice(AREA_CAP);
    const dirs = new Map();
    for (const n of rest) {
      const d = path.posix.dirname(n.id).replace(/^src\//, "");
      dirs.set(d, (dirs.get(d) ?? 0) + 1);
    }
    const top = [...dirs.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 4).map(([d, c]) => `${d}/ ${c}`);
    lines.push(`- …and ${rest.length} more (${top.join(", ")}${dirs.size > 4 ? ", …" : ""}); see graph.json`);
  }
  lines.push("");
}

lines.push(`## Routes (${routeEntries.length}) — URL → page file [area]; \`[id]\` is dynamic`);
for (const [u, f] of routeEntries) lines.push(`- ${u} → ${f} [${nodeArea.get(f)}]`);
lines.push("");

fs.writeFileSync(path.join(OUT_DIR, "MAP.md"), lines.join("\n"));

// ---------------------------------------------------------------- report
const other = nodes.filter((n) => n.area === "Other");
console.log(`codemap: ${nodes.length} nodes, ${edges.length} edges, ${routeEntries.length} routes, MAP.md ${lines.length} lines`);
if (other.length) console.log(`  ${other.length} files in "Other": ${other.slice(0, 15).map((n) => n.id).join(", ")}${other.length > 15 ? ", …" : ""}`);
