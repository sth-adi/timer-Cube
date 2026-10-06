/**
 * Browser smoke checks for the flows that have broken before: the keyboard timer,
 * quick delete and manual times, shortcuts, and a whole smart-cube solve (armed,
 * recording, abort, recap, F2L rows).
 *
 *   npm run dev -- -p 3110      (or `npm run build && npm start -- -p 3110`)
 *   npm run e2e                 (BASE_URL=http://localhost:3000 npm run e2e to aim elsewhere)
 *
 * Exits non-zero if any check fails or the page throws.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { BASE_URL, keyboardSolve, lastSolve, launch, pageText, playTurns, quarterTurns, solveCount, visible } from "./lib.mjs";

const sim = JSON.parse(fs.readFileSync(new URL("./sim.json", import.meta.url), "utf8"));
const results = [];

async function check(name, fn) {
  const { browser, page, errors } = await launch({ smartCubeSim: name.startsWith("smart cube") });
  try {
    await fn(page);
    assert.deepEqual(errors, [], "the page threw");
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, why: e instanceof Error ? e.message.split("\n")[0] : String(e) });
  } finally {
    await browser.close();
  }
}

const open = async (page, path = "/") => {
  await page.goto(BASE_URL + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
};

await check("keyboard timer: solve, +2, note, quick delete", async (page) => {
  await open(page);
  await keyboardSolve(page);
  assert.equal(await solveCount(page), 1);
  const row = page.getByTestId("post-solve-actions");
  await row.locator("button", { hasText: "+2" }).first().click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.getByTestId("solve-note-button").click({ timeout: 5000 });
  await page.getByTestId("solve-note-input").fill("bad cross");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const last = await lastSolve(page);
  assert.equal(last.penalty, "plus2");
  assert.equal(last.comment, "bad cross");
  await page.getByTestId("quick-delete").click({ timeout: 5000 });
  await page.waitForTimeout(700);
  assert.equal(await solveCount(page), 0);
});

await check("keyboard timer: Esc/number keys/? don't disturb a running solve", async (page) => {
  await open(page);
  const surface = page.locator('[role="button"][aria-label$="timer"]').first();
  await page.keyboard.down("Space");
  await page.waitForTimeout(60);
  await page.keyboard.up("Space");
  await page.waitForTimeout(500);
  await page.keyboard.down("Space");
  await page.waitForTimeout(900);
  await page.keyboard.up("Space");
  await page.waitForTimeout(700);
  assert.equal(await surface.getAttribute("aria-label"), "Stop timer");
  await page.keyboard.press("Escape");
  await page.keyboard.press("5");
  await page.keyboard.press("?");
  await page.waitForTimeout(500);
  assert.equal(await surface.getAttribute("aria-label"), "Stop timer");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.ok(new URL(page.url()).pathname === "/");
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await page.waitForTimeout(600);
  assert.equal(await page.getByRole("dialog").count(), 1, "? opens settings when idle");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.equal(await page.getByRole("dialog").count(), 0);
});

await check("manual times: add, chip delete, row delete", async (page) => {
  await open(page, "/solves");
  await page.getByRole("button", { name: "Add manual time" }).click();
  for (const t of ["12.34", "9.99", "15.01"]) {
    await page.getByPlaceholder("12.34 or 1:02.34").fill(t);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
  }
  assert.equal(await solveCount(page), 3);
  await page.getByRole("button", { name: "Delete 9.99" }).click();
  await page.waitForTimeout(500);
  assert.equal(await solveCount(page), 2);
  await page.getByRole("button", { name: /^Delete solve/ }).first().click();
  await page.waitForTimeout(500);
  assert.equal(await solveCount(page), 1);
});

const connectSmartCube = async (page) => {
  await page.goto(BASE_URL + "/?scramble=" + encodeURIComponent(sim.scramble), { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Race it" }).click().catch(() => {});
  await page.getByRole("button", { name: "Smart cube", exact: true }).click();
  await page.getByRole("button", { name: "Connect smart cube" }).click();
  await page.waitForTimeout(800);
};
const startSolving = async (page, solveTurns) => {
  await playTurns(page, quarterTurns(sim.scramble), 10);
  await page.waitForTimeout(500);
  await playTurns(page, sim.solve.slice(0, solveTurns), 80);
  await page.waitForTimeout(200);
};

await check("smart cube: armed, cancel, abort mid-solve saves nothing", async (page) => {
  await connectSmartCube(page);
  await playTurns(page, quarterTurns(sim.scramble), 10);
  await page.waitForTimeout(500);
  assert.ok(await visible(page, "cancel-inspection"), "armed after the scramble matches");
  await page.getByTestId("cancel-inspection").click();
  await page.waitForTimeout(800);
  assert.ok(!(await visible(page, "cancel-inspection")));
  await connectSmartCube(page);
  await startSolving(page, 8);
  assert.ok(await visible(page, "abort-solve"), "recording");
  await page.getByTestId("abort-solve").click();
  await page.waitForTimeout(1000);
  assert.ok(!(await visible(page, "abort-solve")));
  assert.equal(await solveCount(page), 0);
});

await check("smart cube: Back mid-solve aborts and stays on the page", async (page) => {
  await connectSmartCube(page);
  const url = page.url();
  await startSolving(page, 8);
  await page.goBack();
  await page.waitForTimeout(1200);
  assert.equal(page.url(), url);
  assert.ok(!(await visible(page, "abort-solve")));
  assert.equal(await solveCount(page), 0);
});

await check("smart cube: full solve saves, shows every CFOP row, quick delete removes it", async (page) => {
  await connectSmartCube(page);
  await startSolving(page, 8);
  await playTurns(page, sim.solve.slice(8), 60);
  await page.waitForFunction(() => /Saved/.test(document.body.innerText), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  assert.equal(await solveCount(page), 1);
  // The recap scrolls inside its own pane; the page itself must never grow past the screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  assert.ok(overflow <= 1, `page scrolls ${overflow}px past the screen`);
  const text = await pageText(page);
  for (const label of ["Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"]) assert.ok(text.includes(label), `recap has ${label}`);
  await page.getByTestId("quick-delete").click();
  await page.waitForTimeout(900);
  assert.equal(await solveCount(page), 0);
});

await check("smart cube: turning the cube to scramble again clears the recap", async (page) => {
  await connectSmartCube(page);
  await startSolving(page, 8);
  await playTurns(page, sim.solve.slice(8), 60);
  await page.waitForFunction(() => /Saved/.test(document.body.innerText), null, { timeout: 20000 });
  await page.waitForTimeout(2000);
  assert.ok(await visible(page, "recap-actions"), "the recap is up after the solve");
  await playTurns(page, ["R", "U'"], 60);
  await page.waitForTimeout(800);
  assert.ok(!(await visible(page, "recap-actions")), "two scramble turns clear the recap");
  assert.equal(await solveCount(page), 1, "the solve itself is kept");
});

await check("smart cube: the replay carries the recorded gyro as a Gyro Twin", async (page) => {
  await connectSmartCube(page);
  await page.evaluate(() => window.__cubeSim.gyro({ x: 0, y: 0, z: 0, w: 1 }));
  await playTurns(page, quarterTurns(sim.scramble), 10);
  await page.waitForTimeout(500);
  await playTurns(page, sim.solve, 60, { gyro: true });
  await page.waitForFunction(() => /Saved/.test(document.body.innerText), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByTestId("recap-replay").click();
  await page.getByTestId("replay-gyro-twin").waitFor({ timeout: 15000 });
});

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n      ${r.why}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
