import { CubeStage, ReplayControlsSkeleton } from "@/components/lab/CubeStage";
import { useStageBackground } from "./useStageBackground";
import "@/styles/replaystage.css";

/**
 * What a stage replay shows while its player's own code is still downloading: the same coloured card at the
 * same size, a quiet cube in it, and the controls' skeleton beside or under it, so nothing moves when it arrives.
 */
export function StagePlaceholder({ fit = "page" }: { fit?: "sheet" | "page" }) {
  const bg = useStageBackground();
  return (
    <div className="replay-host flex w-full flex-col items-center gap-3" data-fit={fit} role="status" aria-label="Loading the replay">
      <div className="replay-stage-box" data-fit={fit} data-bg={bg}>
        <div className="replay-stage__cube">
          <CubeStage className="h-full w-full" state="loading" />
        </div>
      </div>
      <div className="flex w-full min-w-0 flex-col items-center gap-3">
        <ReplayControlsSkeleton />
      </div>
    </div>
  );
}
