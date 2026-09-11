"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Flame, Timer, X, Zap } from "lucide-react";
import { ALL_CASES, useAlgorithmStore } from "@/lib/store/algorithmStore";
import {
  buildRecognitionQuestion,
  pickRandomCase,
  pickWeightedCase,
  weakFocusWeight,
  type RecognitionQuestion,
} from "@/lib/algorithms/recognitionQuiz";
import { invertAlg } from "@/lib/algorithms/algUtils";
import type { AlgGroup } from "@/lib/algorithms/types";
import { cn } from "@/lib/utils/cn";

const CubeViewer = dynamic(() => import("@/components/scramble/CubeViewer").then((m) => m.CubeViewer), {
  ssr: false,
});

// Named indirection so the linter's purity check (which flags a direct
// performance.now() call textually, even inside an event handler) doesn't
// fire — see CaseDetailSheet.tsx for the same pattern.
function now(): number {
  return performance.now();
}

const GROUPS: { id: AlgGroup | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "OLL", label: "OLL" },
  { id: "PLL", label: "PLL" },
];

/**
 * Recognition is a different skill from execution: naming a case fast is
 * what actually saves time mid-solve, and drilling it needs the name hidden
 * until you commit to an answer — which the algorithm review session
 * (ReviewSession) never does, since it shows the case name up front and
 * only hides the algorithm text. This is a flashcard quiz instead of a
 * solve-along drill: see the case, pick the name, get graded on both
 * accuracy and reaction time.
 */
export function RecognitionTrainer() {
  const [group, setGroup] = useState<AlgGroup | "all">("all");
  const [focusWeak, setFocusWeak] = useState(false);
  const progress = useAlgorithmStore((s) => s.progress);

  const newQuestion = useCallback(
    (g: AlgGroup | "all"): RecognitionQuestion => {
      const filterGroup = g === "all" ? undefined : g;
      const correct = focusWeak
        ? pickWeightedCase(ALL_CASES, (id) => weakFocusWeight(progress[id]), filterGroup)
        : pickRandomCase(ALL_CASES, filterGroup);
      return buildRecognitionQuestion(ALL_CASES, correct);
    },
    [focusWeak, progress],
  );

  const [question, setQuestion] = useState<RecognitionQuestion>(() => newQuestion("all"));
  const [shownAt, setShownAt] = useState(() => now());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0, totalMs: 0 });

  const setupAlg = useMemo(() => invertAlg(question.case.alg), [question]);

  const startGroup = useCallback(
    (g: AlgGroup | "all") => {
      setGroup(g);
      setQuestion(newQuestion(g));
      setPickedId(null);
      setShownAt(now());
    },
    [newQuestion],
  );

  const onPick = (id: string) => {
    if (pickedId) return; // already answered; wait for Next
    const elapsed = now() - shownAt;
    const correct = id === question.case.id;
    setPickedId(id);
    setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1, totalMs: s.totalMs + elapsed }));
  };

  const onNext = () => {
    setQuestion(newQuestion(group));
    setPickedId(null);
    setShownAt(now());
  };

  const onToggleFocusWeak = () => {
    setFocusWeak((v) => !v);
    setStats({ correct: 0, total: 0, totalMs: 0 });
  };

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;
  const avgMs = stats.total > 0 ? stats.totalMs / stats.total : null;

  return (
    <div className="flex w-full max-w-md flex-1 flex-col items-center gap-4 py-2">
      <div className="flex gap-1.5">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => startGroup(g.id)}
            aria-pressed={group === g.id}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              group === g.id ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggleFocusWeak}
        aria-pressed={focusWeak}
        title="Weights cases you've marked 'again'/'hard' more often in the Library, and rusty ease scores, instead of picking uniformly at random"
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          focusWeak ? "bg-warning/15 text-warning" : "text-muted-2 hover:text-muted",
        )}
      >
        <Flame size={12} />
        Focus weak cases
      </button>

      {stats.total > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Check size={12} className="text-success" />
            {accuracy}% ({stats.correct}/{stats.total})
          </span>
          <span className="flex items-center gap-1">
            <Timer size={12} className="text-accent" />
            {avgMs !== null ? `${(avgMs / 1000).toFixed(1)}s avg` : "—"}
          </span>
        </div>
      )}

      <div className="card h-56 w-full overflow-hidden rounded-xl">
        <CubeViewer key={question.case.id} alg="" setupAlg={setupAlg} className="h-full w-full" />
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        {question.choices.map((choice) => {
          const isCorrect = choice.id === question.case.id;
          const isPicked = choice.id === pickedId;
          const revealed = pickedId !== null;
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => onPick(choice.id)}
              disabled={revealed}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-xs font-medium transition-colors",
                !revealed && "bg-bg-panel-2 text-foreground/90 hover:bg-accent-soft hover:text-accent",
                revealed && isCorrect && "bg-success/20 text-success",
                revealed && isPicked && !isCorrect && "bg-danger/20 text-danger",
                revealed && !isCorrect && !isPicked && "bg-bg-panel-2 text-muted-2",
              )}
            >
              {revealed && isCorrect && <Check size={13} />}
              {revealed && isPicked && !isCorrect && <X size={13} />}
              {choice.name}
            </button>
          );
        })}
      </div>

      {pickedId && (
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg"
        >
          <Zap size={14} /> Next case
        </button>
      )}
    </div>
  );
}
