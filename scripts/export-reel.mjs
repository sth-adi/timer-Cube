#!/usr/bin/env node
/**
 * Export a Solve Reel straight from your account, no clicking.
 *
 *   node scripts/export-reel.mjs --best            # fastest solve on the account
 *   node scripts/export-reel.mjs --latest          # newest smart-cube solve
 *   node scripts/export-reel.mjs --index 3         # 3rd newest (1-based)
 *   node scripts/export-reel.mjs --best --headless # run without a window (can hang)
 *
 * It drives the real /reel page in a browser profile that stays signed in, so the output is exactly what
 * the app records by hand. Nothing here talks to the database directly and no key is stored anywhere:
 * the sign-in is the normal username + password form.
 *
 * Credentials: CUBE_USER / CUBE_PASS in the environment or in a git-ignored `.env.local`.
 * Options: --url <site> (default CUBE_URL or https://zelta-timer.vercel.app), --out <dir> (default ./reels),
 *          --no-ramp (no slow-mo on the last moves: use this for the split-screen with compose-reel, whose camera footage runs at real speed),
 *          --slow (half-speed slow-mo), --no-sound (silent reel), --headless, --realtime (old MediaRecorder capture with sound; can freeze at the first move, --slow/--no-sound/--no-warmup apply there).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadDotEnv(path.resolve(".env.local"));

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const URL_BASE = (opt("url", process.env.CUBE_URL ?? "https://zelta-timer.vercel.app")).replace(/\/$/, "");
const OUT = path.resolve(opt("out", "reels"));
const PROFILE = path.resolve(".reel-profile");
const user = process.env.CUBE_USER;
const pass = process.env.CUBE_PASS;
const pick = flag("latest") ? "latest" : opt("index", null) ? `index:${opt("index")}` : "best";

/** "1:02.45" / "9.87" / "DNF" -> ms (null when unreadable). */
function parseTime(text) {
  const m = text.trim().match(/^(?:(\d+):)?(\d+)\.(\d+)/);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 + Number(m[3].padEnd(3, "0").slice(0, 3));
}

fs.mkdirSync(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome", // real Chrome records H.264 MP4; bundled Chromium only does WebM
  headless: flag("headless"), // headed by default: headless hung on recording once
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

try {
  // 1. Sign in if this profile isn't already.
  await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Settings").first().click({ timeout: 30_000 });
  const usernameBox = page.getByLabel("Username");
  if (await usernameBox.isVisible({ timeout: 4_000 }).catch(() => false)) {
    if (!user || !pass) throw new Error("Not signed in: set CUBE_USER and CUBE_PASS (env or .env.local).");
    await usernameBox.fill(user);
    await page.getByLabel("Password").fill(pass);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Username").waitFor({ state: "hidden", timeout: 30_000 });
    console.log("signed in");
  } else {
    console.log("already signed in");
  }

  // 2. Open the reel page (a full navigation re-runs the bootstrap, which syncs the account's solves).
  await page.goto(`${URL_BASE}/reel${flag("no-ramp") ? "?ramp=0" : ""}`, { waitUntil: "domcontentloaded" });
  const chips = page.locator("div.overflow-x-auto > button");
  await chips.first().waitFor({ timeout: 90_000 }); // appears once solves have synced from the account
  await page.waitForTimeout(2_000); // let the sync settle so "best" sees every solve

  const texts = await chips.evaluateAll((els) => els.map((e) => e.querySelector("span")?.textContent ?? ""));
  const times = texts.map(parseTime);
  console.log(`${texts.length} smart-cube solves listed (newest first): ${texts.slice(0, 8).join(", ")}${texts.length > 8 ? ", ..." : ""}`);

  let i = 0;
  if (pick === "best") {
    let bestMs = Infinity;
    times.forEach((ms, k) => ms !== null && ms < bestMs && ((bestMs = ms), (i = k)));
  } else if (pick.startsWith("index:")) {
    i = Math.max(0, Number(pick.slice(6)) - 1);
  }
  if (i >= texts.length) throw new Error(`Only ${texts.length} solves available.`);
  console.log(`exporting #${i + 1}: ${texts[i]}`);
  await chips.nth(i).click();

  if (!flag("realtime")) {
    // 3. Frame-exact render: step the page's scrubber through the whole reel at 30 fps and grab the canvas each
    //    time. No real-time recording, so no dropped frames or freezes: the timer counts up from 0.00 smoothly.
    const FPS = 30;
    const { min, max } = await page.evaluate(() => {
      const el = document.querySelector('input[aria-label="Scrub reel"]');
      return { min: Number(el.min), max: Number(el.max) };
    });
    const step = 1000 / FPS;
    const total = Math.floor((max - min) / step) + 1;
    const framesDir = fs.mkdtempSync(path.join(OUT, ".frames-"));
    console.log(`rendering ${total} frames (${((max - min) / 1000).toFixed(1)}s at ${FPS} fps)...`);
    for (let k0 = 0; k0 < total; k0 += 30) {
      const n = Math.min(30, total - k0);
      const batch = await page.evaluate(
        ({ k0, n, min, step }) => {
          const input = document.querySelector('input[aria-label="Scrub reel"]');
          const canvas = document.querySelector("canvas");
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          const out = [];
          for (let k = k0; k < k0 + n; k++) {
            set.call(input, String(Math.round(min + k * step)));
            input.dispatchEvent(new Event("input", { bubbles: true }));
            out.push(canvas.toDataURL("image/jpeg", 0.95).slice("data:image/jpeg;base64,".length));
          }
          return out;
        },
        { k0, n, min, step },
      );
      batch.forEach((b64, j) => fs.writeFileSync(path.join(framesDir, `${String(k0 + j).padStart(5, "0")}.jpg`), Buffer.from(b64, "base64")));
    }
    const dest = path.join(OUT, `solve-${texts[i].replace(/[^0-9]+/g, "-")}-${Date.now()}.mp4`);
    const r = spawnSync(
      "ffmpeg",
      ["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dest],
      { stdio: "inherit" },
    );
    fs.rmSync(framesDir, { recursive: true, force: true });
    if (r.status !== 0) throw new Error("ffmpeg failed to encode the frames");
    console.log(`saved ${dest} (silent; the soundtrack is not rendered in this mode)`);
  } else {
    // 3b. Legacy: record in real time with MediaRecorder (has the soundtrack, but can freeze at the first move).
    if (flag("slow")) await page.getByRole("button", { name: "Slow-mo" }).click();
    const soundBtn = page.getByRole("button", { name: "Soundtrack" });
    if (flag("no-sound") && (await soundBtn.isVisible().catch(() => false)) && (await soundBtn.getAttribute("aria-pressed")) === "true") await soundBtn.click();
    await page.getByRole("button", { name: "Record video" }).waitFor({ timeout: 60_000 });
    if (!flag("no-warmup")) {
      // The first run of the animation hitches (the picture freezes for ~1-2s at the first move), so play it
      // once as a preview to warm everything up; the recording that follows is smooth from 0.00.
      console.log("warming up (preview)...");
      await page.getByRole("button", { name: "Preview" }).click();
      await page.getByRole("button", { name: "Stop" }).waitFor({ timeout: 10_000 });
      await page.getByRole("button", { name: "Record video" }).waitFor({ timeout: 3 * 60_000 });
      await page.waitForTimeout(500);
    }
    await page.getByRole("button", { name: "Record video" }).click();
    console.log("recording (real time)...");
    const link = page.getByRole("link", { name: "Download video" });
    await link.waitFor({ timeout: 10 * 60_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const ext = path.extname(download.suggestedFilename()) || ".mp4";
    const dest = path.join(OUT, `${path.basename(download.suggestedFilename(), ext)}-${Date.now()}${ext}`);
    await download.saveAs(dest);
    console.log(`saved ${dest}`);
    if (ext !== ".mp4") console.log("note: this browser produced WebM; convert with ffmpeg before editing.");
  }
} finally {
  await ctx.close();
}
