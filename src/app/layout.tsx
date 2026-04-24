import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/components/providers/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Workflow Blueprint",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Blueprint",
  },
  title: "Workflow Blueprint",
  description: "A blueprint-inspired task planning workspace for personal and team execution.",
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcff" },
    { media: "(prefers-color-scheme: dark)", color: "#09172f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
