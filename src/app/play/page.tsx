"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { CubeStatus } from "@/components/play/PlayShell";
import { EchoArt, GolfArt, MazeArt, PortraitArt, TwistrisArt, VaultArt, WakeArt } from "@/components/play/Art";

const GAMES = [
  {
    href: "/vault",
    name: "Cube Vault",
    hook: "Your cube is the password.",
    body: "Twist it into any state and seal a message with it. The link only opens when someone's cube reaches that exact state, 43 quintillion to choose from.",
    accent: "#ffc53d",
    Art: VaultArt,
    needs: "Any cube",
  },
  {
    href: "/maze",
    name: "Tilt Maze",
    hook: "Your cube is the board.",
    body: "Tilt it to roll a marble through a labyrinth. Turn a face to open the gate of its color, for a few seconds.",
    accent: "#3de8ff",
    Art: MazeArt,
    needs: "Gyro cube · or phone tilt",
  },
  {
    href: "/twistris",
    name: "Twistris",
    hook: "Your cube is the controller.",
    body: "Falling blocks. R slides right, L slides left, U spins, F slams.",
    accent: "#ff4fd8",
    Art: TwistrisArt,
    needs: "Any cube",
  },
  {
    href: "/portraits",
    name: "Solve Portraits",
    hook: "Your solves are art.",
    body: "Every solve you've done, drawn as a small piece of art, then draw live with your turns.",
    accent: "#b36bff",
    Art: PortraitArt,
    needs: "Your solve history",
  },
  {
    href: "/wake",
    name: "Wake Solve",
    hook: "Your cube is the snooze button.",
    body: "An alarm that won't stop until you scramble your cube and solve it.",
    accent: "#ff7a45",
    Art: WakeArt,
    needs: "Any cube",
  },
  {
    href: "/echo",
    name: "Echo",
    hook: "Your cube is the memory test.",
    body: "Watch a run of turns, play it back from memory, and it adds one more each round. One wrong turn ends it.",
    accent: "#3dffb0",
    Art: EchoArt,
    needs: "Any cube",
  },
  {
    href: "/golf",
    name: "Cube Golf",
    hook: "Your cube is the course.",
    body: "Scramble a few turns, then solve it in as few as you can. Par is the shortest solution that exists, worked out exactly, and revealed after every hole.",
    accent: "#7dff6a",
    Art: GolfArt,
    needs: "Any cube",
  },
] as const;

const [LEAD, ...REST] = GAMES;

/**
 * Play: things a smart cube was never meant to do. Its own destination —
 * not a Lab tool — with its own arcade look (globals.css `.play-root`).
 */
export default function PlayHub() {
  return (
    <div className="play-root" style={{ ["--play-accent" as string]: "#b36bff" }}>
      <AppBootstrap />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-24 pt-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="hit-y text-xs font-semibold text-[var(--play-dim)] hover:text-white">
            ‹ Timer
          </Link>
          <CubeStatus />
        </div>
        <header className="flex flex-col gap-2 pt-2">
          <h1 className="play-title text-[68px] sm:text-[88px]">Play</h1>
          <p className="max-w-md text-[14px] leading-snug text-[var(--play-dim)]">
            Seven things your smart cube was never meant to do. No cube handy? Every one works with the keyboard or the on-screen pad too.
          </p>
        </header>
        <Link
          href={LEAD.href}
          className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 sm:flex-row"
        >
          <div className="flex h-48 items-center justify-center sm:h-auto sm:w-1/2" style={{ background: `${LEAD.accent}1a` }}>
            <LEAD.Art className="h-full w-full max-w-[280px] p-2 transition-transform duration-300 group-hover:scale-105" />
          </div>
          <div className="flex flex-col gap-1.5 p-4 sm:justify-center sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[22px] font-black tracking-tight" style={{ color: LEAD.accent }}>
                {LEAD.name}
              </h2>
              <ArrowUpRight size={18} className="text-white/30 transition-colors group-hover:text-white" />
            </div>
            <p className="text-[15px] font-bold leading-tight text-white">{LEAD.hook}</p>
            <p className="text-[12.5px] leading-snug text-[var(--play-dim)]">{LEAD.body}</p>
            <span className="mt-1 self-start text-[10px] font-semibold uppercase tracking-wider text-white/45">{LEAD.needs}</span>
          </div>
        </Link>
        <ul className="flex flex-col divide-y divide-white/10 border-y border-white/10">
          {REST.map((g) => (
            <li key={g.href}>
              <Link href={g.href} className="group flex items-center gap-4 py-3 transition-colors hover:bg-white/[0.03]">
                <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg" style={{ background: `${g.accent}14` }}>
                  <g.Art className="h-full w-full p-1" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h2 className="text-[18px] font-black tracking-tight" style={{ color: g.accent }}>
                    {g.name}
                  </h2>
                  <p className="text-[14px] font-bold leading-tight text-white">{g.hook}</p>
                  <p className="text-[12.5px] leading-snug text-[var(--play-dim)]">{g.body}</p>
                  <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">{g.needs}</span>
                </div>
                <ArrowUpRight size={18} className="shrink-0 text-white/30 transition-colors group-hover:text-white" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
