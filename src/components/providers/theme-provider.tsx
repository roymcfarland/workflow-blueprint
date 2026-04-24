"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="day"
      enableSystem
      disableTransitionOnChange
      themes={["day", "night"]}
      value={{
        day: "light",
        night: "dark",
      }}
    >
      {children}
    </NextThemeProvider>
  );
}
