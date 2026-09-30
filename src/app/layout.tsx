import type { Metadata, Viewport } from "next";
import { getSession } from "@/lib/auth";
import { resolveTheme } from "@/lib/theme";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BUILDFlow", template: "%s · BUILDFlow" },
  description: "Construction operating system for premium residential builders.",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  appleWebApp: { capable: true, title: "BUILDFlow", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06121F" },
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const { theme, sunlight } = await resolveTheme(session?.user ?? null);
  return (
    <html lang="en" data-theme={theme} data-sunlight={sunlight ? "on" : "off"} suppressHydrationWarning>
      <body className="relative">
        <div className="relative z-10">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
