"use client"; // Error boundaries must be Client Components

import "./globals.css";
import { ErrorScreen } from "@/components/chrome/ErrorScreen";
import { PAINT_SETTINGS_SCRIPT } from "@/lib/theme/paintScript";

/** Replaces the root layout when it crashes, so it brings its own <html>, <body>, styles and saved theme. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <title>Something went wrong</title>
        <script dangerouslySetInnerHTML={{ __html: PAINT_SETTINGS_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ErrorScreen error={error} onRetry={retry} />
      </body>
    </html>
  );
}
