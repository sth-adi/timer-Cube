"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { CubeStatus } from "@/components/play/PlayShell";
import { MazeArt, PortraitArt, TwistrisArt, VaultArt, WakeArt } from "@/components/play/Art";
import { cn } from "@/lib/utils/cn";

const GAMES = [
  {
    href: "/vault",
    name: "Cube Vault",
    hook: "Your cube is the password.",
    body: "Twist it into any state and seal a message with it. The link only opens when someone's cube reaches that exact state — 43 quintillion to choose from.",
    accent: "#ffc53d",
    Art: VaultArt,
    needs: "Any cube",
  },
  {
    href: "/maze",
    name: "Tilt Maze",
    hook: "Your cube is the board.",
    body: "Tilt it to roll a marble through a labyrinth. Turn a face to open the gate of its color — for a few seconds.",
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
    body: "Every solve you've done, drawn as its own glowing piece — then draw live with your turns.",
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
] as const;

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
          <Link href="/" className="text-xs font-semibold text-[var(--play-dim)] hover:text-white">
            ‹ Timer
          </Link>
          <CubeStatus />
        </div>
        <header className="flex flex-col gap-2 pt-2">
          <h1 className="play-title text-[68px] sm:text-[88px]">Play</h1>
          <p className="max-w-md text-[14px] leading-snug text-[var(--play-dim)]">
            Five things your smart cube was never meant to do. No cube handy? Every one works with the keyboard or the on-screen pad too.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GAMES.map((g, i) => (
            <Link
              key={g.href}
              href={g.href}
              className={cn(
                "group relative flex overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] transition-transform duration-200 hover:-translate-y-0.5",
                i === 0 ? "flex-col sm:col-span-2 sm:flex-row" : "flex-col",
              )}
              style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -40px ${g.accent}` }}
            >
              <div
                className={cn("relative flex items-center justify-center", i === 0 ? "h-48 sm:h-auto sm:w-1/2" : "h-40")}
                style={{ background: `radial-gradient(circle at 50% 60%, ${g.accent}26, transparent 70%)` }}
              >
                <g.Art className="h-full w-full max-w-[280px] p-2 transition-transform duration-300 group-hover:scale-105" />
              </div>
              <div className={cn("flex flex-col gap-1.5 p-4 pt-1", i === 0 && "sm:justify-center sm:p-6")}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[22px] font-black tracking-tight" style={{ color: g.accent }}>
                    {g.name}
                  </h2>
                  <ArrowUpRight size={18} className="text-white/30 transition-colors group-hover:text-white" />
                </div>
                <p className="text-[15px] font-bold leading-tight text-white">{g.hook}</p>
                <p className="text-[12.5px] leading-snug text-[var(--play-dim)]">{g.body}</p>
                <span className="mt-1 self-start rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">{g.needs}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
