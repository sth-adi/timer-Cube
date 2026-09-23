"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordToolVisit } from "@/lib/usage/toolUsage";

/** Counts screen visits on this device (see lib/usage/toolUsage.ts). Renders nothing. */
export function UsageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordToolVisit(pathname);
  }, [pathname]);
  return null;
}
