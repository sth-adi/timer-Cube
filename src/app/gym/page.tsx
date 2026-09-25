"use client";

import Link from "next/link";
import { Dumbbell, Timer as TimerIcon } from "lucide-react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { AppBackground } from "@/components/chrome/AppBackground";
import { AlgGymTrainer } from "@/components/gym/AlgGymTrainer";

/**
 * Alg Gym: OLL/PLL drills on a real cube — setup checked turn by turn,
 * recognition and execution timed off the cube itself, wrong algorithms
 * caught and named. Also reachable from the Trainer tab's Gym mode
 * (TrainerHub.tsx) — this route is the direct link the Lab points at.
 */
export default function GymPage() {
  return (
    <>
      <AppBootstrap />
      <AppBackground />
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <TimerIcon size={16} className="text-accent" />
          Cube
        </Link>
        <div className="flex w-full max-w-md flex-col gap-3 pb-10">
          <div className="flex flex-col gap-0.5 px-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Dumbbell size={17} className="text-accent" /> Alg Gym
            </h1>
            <p className="text-[11px] text-muted-2">Last-layer drills on your real cube — timed, checked, and aimed at your weak cases.</p>
          </div>
          <AlgGymTrainer />
        </div>
      </div>
    </>
  );
}
