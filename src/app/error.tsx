"use client"; // Error boundaries must be Client Components

import { ErrorScreen } from "@/components/chrome/ErrorScreen";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} onRetry={retry} />;
}
