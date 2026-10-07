import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { UsageTracker } from "@/components/chrome/UsageTracker";
import { FxLayer } from "@/components/chrome/FxLayer";
import { UndoToast } from "@/components/chrome/UndoToast";
import { ClientEnv } from "@/components/chrome/ClientEnv";
import { UpdateToast } from "@/components/chrome/UpdateToast";
import { MacPromptDialog } from "@/components/smartcube/MacPromptDialog";
import { PAINT_SETTINGS_SCRIPT } from "@/lib/theme/paintScript";
import { DEFAULT_THEME_COLOR, THEME_COLOR_SCRIPT } from "@/lib/theme/themeColor";
import { ThemeColorSync } from "@/components/chrome/ThemeColorSync";
import { AccountDataPrompt } from "@/components/chrome/AccountDataPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Cube", statusBarStyle: "black-translucent" },
  title: "Cube, the speedcubing timer",
  description:
    "A fast, aesthetic speedcubing timer with random-state 3x3 scrambles, session stats, and hidden cross/CFOP solve hints.",
};

export const viewport: Viewport = {
  // The default theme's page background; the saved theme's colour replaces it before first paint (THEME_COLOR_SCRIPT) and ThemeColorSync follows changes.
  themeColor: DEFAULT_THEME_COLOR,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PAINT_SETTINGS_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: THEME_COLOR_SCRIPT }} />
        <ThemeColorSync />
        <UsageTracker />
        {children}
        <FxLayer />
        <MacPromptDialog />
        <AccountDataPrompt />
        <UndoToast />
        <UpdateToast />
        <ClientEnv />
      </body>
    </html>
  );
}
