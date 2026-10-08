import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline, Cube" };

/** What the service worker shows for a page it hasn't saved: the timer itself always works. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-bg-panel-2 text-muted">
        <WifiOff size={26} />
      </span>
      <h1 className="text-lg font-semibold">This page isn&apos;t saved on your device yet</h1>
      <p className="text-sm leading-relaxed text-muted">
        Open it once while you&apos;re online and it will work offline from then on. The timer, your solves and your stats are always
        available, and anything you record syncs when you&apos;re back online.
      </p>
      <Link href="/" className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-accent-fg">
        Back to the timer
      </Link>
    </main>
  );
}
