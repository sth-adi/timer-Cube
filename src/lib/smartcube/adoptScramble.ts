import { getCubeEngineClient } from "@/lib/cube-engine/client";
import { scrambleFromSolution, scrambleReproduces } from "./freestyle";

/**
 * The scramble that makes a solved cube look like `facelets` — for when the
 * cube in your hands went its own way and you'd rather solve that than undo
 * it. Worked out by the solver worker and checked to rebuild the state
 * exactly before it's trusted; null if it can't be (the state isn't a legal cube).
 */
export async function scrambleForState(facelets: string): Promise<string | null> {
  try {
    const solution = await getCubeEngineClient().computeCorrectiveMoves("", facelets);
    const scramble = scrambleFromSolution(solution);
    return scramble && scrambleReproduces(scramble, facelets) ? scramble : null;
  } catch {
    return null;
  }
}
