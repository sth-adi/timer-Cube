"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { CubeStatus } from "@/components/play/PlayShell";
import { EchoArt, GolfArt, MazeArt, PortraitArt, TwistrisArt, VaultArt, WakeArt } from "@/components/play/Art";

const GAMES = [
  {
    href: "/vault",
    name: "Cube vault",
    hook: "Your cube is the password.",
    body: "Twist it into any state and seal a message with it. The link only opens when someone's cube reaches that exact state, 43 quintillion to choose from.",
    Art: VaultArt,
    needs: "Any cube",
  },
  {
    href: "/maze",
    name: "Tilt maze",
    hook: "Your cube is the board.",
    body: "Tilt it to roll a marble through a labyrinth. Turn a face to open the gate of its color, for a few seconds.",
    Art: MazeArt,
    needs: "Gyro cube or phone tilt",
  },
  {
    href: "/twistris",
    name: "Twistris",
    hook: "Your cube is the controller.",
    body: "Falling blocks. R slides right, L slides left, U spins, F slams.",
    Art: TwistrisArt,
    needs: "Any cube",
  },
  {
    href: "/portraits",
    name: "Solve portraits",
    hook: "Your solves are art.",
    body: "Every solve you've done, drawn as a small piece of art, then draw live with your turns.",
    Art: PortraitArt,
    needs: "Your solve history",
  },
  {
    href: "/wake",
    name: "Wake solve",
    hook: "Your cube is the snooze button.",
    body: "An alarm that won't stop until you scramble your cube and solve it.",
    Art: WakeArt,
    needs: "Any cube",
  },
  {
    href: "/echo",
    name: "Echo",
    hook: "Your cube is the memory test.",
    body: "Watch a run of turns, play it back from memory, and it adds one more each round. One wrong turn ends it.",
    Art: EchoArt,
    needs: "Any cube",
  },
  {
    href: "/golf",
    name: "Cube golf",
    hook: "Your cube is the course.",
    body: "Scramble a few turns, then solve it in as few as you can. Par is the shortest solution that exists, worked out exactly, and revealed after every hole.",
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
    <div className="play-root">
      <AppBootstrap />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-24 pt-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="hit-y text-xs font-medium text-[var(--play-dim)] hover:text-white">
            Back to timer
          </Link>
          <CubeStatus />
        </div>
        <header className="flex flex-col gap-2 pt-2">
          <h1 className="play-title text-[56px] sm:text-[72px]">Play</h1>
          <p className="max-w-md text-pretty text-[14px] leading-snug text-[var(--play-dim)]">
            Seven things your smart cube was never meant to do. No cube handy? Each one also works with the keyboard or the on-screen pad.
          </p>
        </header>
        <Link
          href={LEAD.href}
          className="play-panel group flex flex-col overflow-hidden rounded-2xl sm:grid sm:grid-cols-2"
        >
          <div className="flex h-48 items-center justify-center bg-white/[0.03] sm:h-auto">
            <LEAD.Art className="h-full w-full max-w-[280px] p-2 transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-105" />
          </div>
          <div className="flex flex-col gap-1.5 p-4 sm:justify-center sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[22px] font-bold tracking-[-0.02em] text-[var(--play-ink)]">
                {LEAD.name}
              </h2>
              <ArrowUpRight size={18} strokeWidth={1.75} className="text-[var(--play-dim)] transition-colors group-hover:text-[var(--play-accent)]" />
            </div>
            <p className="text-[15px] font-semibold leading-tight text-balance text-[var(--play-ink)]">{LEAD.hook}</p>
            <p className="text-pretty text-[13px] leading-snug text-[var(--play-dim)]">{LEAD.body}</p>
            <span className="mt-1 self-start text-[12px] font-medium text-[var(--play-dim)]">{LEAD.needs}</span>
          </div>
        </Link>
        <ul className="flex flex-col divide-y divide-white/10 border-y border-white/10">
          {REST.map((g) => (
            <li key={g.href}>
              <Link href={g.href} className="group flex items-center gap-4 py-3 transition-colors [@media(hover:hover)]:hover:bg-white/[0.03]">
                <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-white/[0.03]">
                  <g.Art className="h-full w-full p-1" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--play-ink)]">
                    {g.name}
                  </h2>
                  <p className="text-[14px] font-medium leading-tight text-[var(--play-ink)]">{g.hook}</p>
                  <p className="text-pretty text-[13px] leading-snug text-[var(--play-dim)]">{g.body}</p>
                  <span className="mt-0.5 text-[12px] font-medium text-[var(--play-dim)]">{g.needs}</span>
                </div>
                <ArrowUpRight size={18} strokeWidth={1.75} className="shrink-0 text-[var(--play-dim)] transition-colors group-hover:text-[var(--play-accent)]" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
