import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { skeletonWidth } from "@/components/ui/skeletonWidths";

const CARD = "card rounded-xl p-3";
const SECTION = "border-t border-border px-1 pt-5";

/**
 * The analyzer's result area while the worker runs: the same cards, in the same order and about the same sizes as
 * the result that replaces them (summary + stats line, what to work on, the replay, the two phase cards), so the
 * answer lands in place instead of pushing the page around.
 */
export function AnalyzerResultSkeleton() {
  return (
    <SkeletonGroup label="Analyzing your solve" delayMs={150} className="flex flex-col gap-3">
      <div className={CARD}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-[64%]" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-2.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>

      <div className={SECTION}>
        <Skeleton className="mb-3 h-3 w-28" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2">
              <Skeleton round className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3" style={{ width: skeletonWidth(i, 40, 70) }} />
                <Skeleton className="h-2.5" style={{ width: skeletonWidth(i + 3, 70, 95) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={SECTION}>
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="mx-auto aspect-square w-full max-w-[16rem] rounded-xl" />
        <Skeleton round className="mx-auto mt-3 h-9 w-full max-w-[16rem]" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-3 w-[88%]" />
          <Skeleton className="h-3 w-[70%]" />
          <Skeleton className="h-3 w-[80%]" />
        </div>
      </div>

      <div className={SECTION}>
        <Skeleton className="mb-3 h-3 w-32" />
        <div className="space-y-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-20 shrink-0" />
              <Skeleton className="h-5 flex-1" style={{ maxWidth: skeletonWidth(i, 35, 90) }} />
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-[75%]" />
        </div>
      </div>

      <div className={SECTION}>
        <Skeleton className="mb-3 h-3 w-28" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}

/** Before anything has been analyzed: say what will show up here, so the page reads as a tool waiting for input, not a half-empty one. */
export function AnalyzerEmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-1 border-y border-border px-6 py-8 text-center"
      data-testid="analyzer-empty"
    >
      <p className="text-sm font-medium text-foreground">Your analysis shows up here</p>
      <p className="max-w-[18rem] text-xs leading-relaxed text-muted-2">
        Add a scramble and your moves above, then press Analyze: you get the cost of each phase and what to work on.
      </p>
    </div>
  );
}
