import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import "@/styles/live-solve.css";

/**
 * The smart-cube solve's big time. Tabular figures (see .timer-digits) keep every digit the same
 * width so the number doesn't breathe as it counts; the hundredths sit in their own span so the
 * stylesheet can quiet them while the clock runs and bring them back, with a small settle, when it
 * stops (styles/live-solve.css, keyed off the surrounding TimerStage's state). Text with no
 * decimal point ("solving", "DNF") is shown as is.
 */
export function LiveDigits({ text, styleClass, className }: { text: string; styleClass?: string; className?: string }) {
  const dot = text.lastIndexOf(".");
  let body: ReactNode = text;
  if (dot > 0 && dot < text.length - 1) {
    body = (
      <>
        {text.slice(0, dot)}
        <span className="live-digits__frac">{text.slice(dot)}</span>
      </>
    );
  }
  return <p className={cn("timer-digits live-digits text-center text-6xl font-bold", styleClass, className)}>{body}</p>;
}
