#!/usr/bin/env node
/**
 * Split-screen TikTok: your phone footage on top, the Solve Reel (virtual reconstruction) underneath.
 *
 *   node scripts/compose-reel.mjs --camera "C:/path/clip.mp4" [--reel reels/solve-....mp4]
 *        --offset 5.28     # camera time minus reel time for the SAME instant (solve end is easiest)
 *        --from 7.7        # camera time to start the output at
 *        --to 25.7         # camera time to stop at (default: end of the clip / reel)
 *        --solve 18.02     # solve time in seconds  } together they drive the progress bar on the divider
 *        --solve-end 24.65 # camera time of the last turn }
 *        --keep-reel-audio # default: the reel's soundtrack is muted, only the camera audio plays
 *        --out reels/tiktok.mp4
 *
 * Sync: find one moment visible in both (the last turn is easiest), note the camera timestamp c and the
 * reel timestamp r where the timer hits its final value, and pass --offset (c - r).
 * Export the reel with `node scripts/export-reel.mjs --no-ramp` for this: the default reel slows its last few moves, which
 * would drift out of sync with camera footage that runs at real speed. Output is 1080x1920, H.264 + AAC.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const camera = opt("camera");
if (!camera || !fs.existsSync(camera)) throw new Error("--camera <file> is required");
const reelDir = path.resolve("reels");
const reel =
  opt("reel") ??
  path.join(
    reelDir,
    fs
      .readdirSync(reelDir)
      .filter((f) => /^solve-.*\.mp4$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(reelDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].f,
  );
const offset = Number(opt("offset", "0")); // camera = reel + offset
const from = Number(opt("from", String(Math.max(0, offset)))); // camera seconds
const to = opt("to") ? Number(opt("to")) : null;
const out = path.resolve(opt("out", path.join(reelDir, `tiktok-${Date.now()}.mp4`)));
const keepReelAudio = args.includes("--keep-reel-audio");
const solveEnd = opt("solve-end") ? Number(opt("solve-end")) : null;
const solveLen = opt("solve") ? Number(opt("solve")) : null;

const BG = "0x0a0a14"; // matches the reel's dark background
const dur = to ? to - from : null;
const reelStart = from - offset;
if (reelStart < 0) throw new Error(`--from ${from} is before the reel starts (needs >= ${offset}).`);

const W = 1080;
const H = 960; // each half
const DIV = 12; // divider thickness
const p1 = solveEnd !== null ? solveEnd - from : null; // output time of the last turn
const p0 = p1 !== null && solveLen !== null ? p1 - solveLen : null; // output time of the first move
const progress = p0 !== null;

const chain = [
  // camera: fill the top half, keep hands + cube, punchy grade + vignette
  `[0:v]fps=30,scale=${W}:-2,crop=${W}:${H}:0:150,eq=contrast=1.12:saturation=1.3:brightness=0.02:gamma=0.95,unsharp=5:5:0.7,vignette=PI/4.5,setsar=1[cam]`,
  // reel: keep timer + cube + move strip, fit the bottom half, pad with the reel background
  `[1:v]fps=30,crop=iw:ih*0.62:0:ih*0.20,scale=-2:${H},pad=${W}:${H}:(ow-iw)/2:0:${BG},eq=saturation=1.15,setsar=1[rl]`,
  `[cam][rl]vstack=inputs=2[base]`,
  // glowing divider: dim full-width line, blurred glow, and a bright bar that fills with the solve
  `[2:v]format=rgba,split=3[l1][l2][l3]`,
  `[l1]colorchannelmixer=aa=0.45[line]`,
  `[l2]pad=${W}:${DIV + 60}:0:30:color=0x00000000,gblur=sigma=14,colorchannelmixer=aa=0.9[glow]`,
  `[base][glow]overlay=0:${H - DIV / 2 - 30}[b1]`,
  `[b1][line]overlay=0:${H - DIV / 2}[b2]`,
  progress
    ? `[b2][l3]overlay=x='-W+W*clip((t-${p0.toFixed(3)})/${solveLen},0,1)':y=${H - DIV / 2}:eval=frame:shortest=1[v]`
    : `[b2][l3]overlay=0:${H - DIV / 2}:shortest=1[v]`,
  // audio: your camera only, loudness-normalised; the reel soundtrack is muted unless asked for
  keepReelAudio
    ? `[0:a]loudnorm=I=-16:TP=-1.5[ca];[ca][1:a]amix=inputs=2:duration=shortest:normalize=0[a]`
    : `[0:a]loudnorm=I=-16:TP=-1.5[a]`,
];
const filter = chain.join(";");

const ff = [
  "-y",
  "-ss", String(from), ...(dur ? ["-t", String(dur)] : []), "-i", camera,
  "-ss", String(reelStart), ...(dur ? ["-t", String(dur)] : []), "-i", reel,
  "-f", "lavfi", "-i", `gradients=s=${W}x${DIV}:c0=0x4f8cff:c1=0xc06bff:x0=0:y0=0:x1=${W}:y1=0:r=30:d=120`,
  "-filter_complex", filter,
  "-map", "[v]", "-map", "[a]",
  "-shortest",
  "-r", "30", "-fps_mode", "cfr",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k",
  "-movflags", "+faststart",
  out,
];
console.log(`camera ${from}s${dur ? ` +${dur}s` : ""}  |  reel ${reelStart.toFixed(2)}s  |  -> ${out}`);
const r = spawnSync("ffmpeg", ff, { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`saved ${out}`);
