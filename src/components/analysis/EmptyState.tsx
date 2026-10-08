import Link from "next/link";

/**
 * The shared "nothing to show yet" block for report pages: a plain title, one sentence on what is
 * missing (with the number needed when there is one), and a single next action. Whitespace and two
 * hairlines frame it; it is deliberately not a card.
 */
export function EmptyState({
  title = "Not enough solves yet",
  need,
  have,
  unit = "solves",
  children,
  href = "/",
  action = "Open timer",
}: {
  title?: string;
  need?: number;
  have?: number;
  unit?: string;
  children?: React.ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 border-y border-border py-8">
      <p className="text-base font-semibold text-foreground">{title}</p>
      {need !== undefined && (
        <p className="text-sm tabular-nums text-muted">
          {have !== undefined ? `${have} of ${need} ${unit}` : `Needs ${need} ${unit}`}
        </p>
      )}
      {children && <div className="max-w-prose text-sm text-muted">{children}</div>}
      <Link href={href} className="hit mt-1 text-sm font-medium text-accent hover:underline">
        {action}
      </Link>
    </div>
  );
}
