import fs from "node:fs";
import { chromium } from "playwright-core";

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3110";

/** The Chromium Playwright was set up with here, if there is one; otherwise Playwright's own download. */
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";

/** Launches a browser and one phone-sized page that records uncaught errors (the dev overlay is hidden so it can't steal clicks). */
export async function launch({ viewport = { width: 390, height: 844 }, smartCubeSim = false } = {}) {
  const browser = await chromium.launch(fs.existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    const hide = () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(st);
    };
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });
  if (smartCubeSim) {
    // The app's own test seam: a cube that turns when window.__cubeSim.turn() is called.
    await ctx.addInitScript(() => {
      if (!("bluetooth" in navigator)) Object.defineProperty(navigator, "bluetooth", { value: { getAvailability: async () => true } });
      const subs = new Set();
      window.__cubeSim = { turn: (m, at) => subs.forEach((f) => f({ type: "MOVE", move: m, timestamp: at ?? performance.now() })) };
      window.__smartCubeTestDriver = {
        connectSmartCube: async () => ({
          deviceName: "SimCube",
          deviceMAC: "AA:BB:CC:DD:EE:FF",
          protocol: { name: "SimProtocol" },
          capabilities: { battery: false, gyroscope: false, facelets: false, hardware: false, reset: false },
          events$: { subscribe: (fn) => (subs.add(fn), { unsubscribe: () => subs.delete(fn) }) },
          disconnect: async () => {},
          sendCommand: async () => {},
        }),
      };
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { browser, page, errors };
}

const idb = (store, fn) => (page) =>
  page.evaluate(
    ([store, fn]) =>
      new Promise((res) => {
        const r = indexedDB.open("cube-timer-db");
        r.onsuccess = () => {
          const s = r.result.transaction(store).objectStore(store);
          const q = fn === "count" ? s.count() : s.index("date").openCursor(null, "prev");
          q.onsuccess = () => res(fn === "count" ? q.result : q.result ? q.result.value : null);
        };
      }),
    [store, fn],
  );

export const solveCount = idb("solves", "count");
export const lastSolve = idb("solves", "last");

/** Smart-cube turns from a scramble/solution string, with half turns written as two quarter turns (as the cube reports them). */
export const quarterTurns = (s) => s.split(" ").filter(Boolean).flatMap((t) => (t.endsWith("2") ? [t[0], t[0]] : [t]));

export const playTurns = (page, moves, gapMs) =>
  page.evaluate(
    async ({ moves, gapMs }) => {
      for (const m of moves) {
        await new Promise((r) => setTimeout(r, gapMs));
        window.__cubeSim.turn(m);
      }
    },
    { moves, gapMs },
  );

export const pageText = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ");
export const visible = (page, testId) => page.getByTestId(testId).isVisible().catch(() => false);

/** Finishes a keyboard-timer solve: hold, release, run a moment, stop. */
export async function keyboardSolve(page, runMs = 1200) {
  await page.keyboard.down("Space");
  await page.waitForTimeout(900);
  await page.keyboard.up("Space");
  await page.waitForTimeout(runMs);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1000);
}
