"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { themePreferences, type ThemePreference } from "@/lib/domain";

type ThemeContextValue = {
  setTheme: (preference: ThemePreference) => void;
  theme: ThemePreference;
};

const themeStorageKey = "theme";
const systemDarkQuery = "(prefers-color-scheme: dark)";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return themePreferences.includes(value as ThemePreference);
}

function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") {
    return "day";
  }

  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return isThemePreference(storedTheme) ? storedTheme : "day";
  } catch {
    return "day";
  }
}

function systemPrefersDark() {
  return window.matchMedia(systemDarkQuery).matches;
}

function isDarkTheme(preference: ThemePreference) {
  return preference === "night" || (preference === "system" && systemPrefersDark());
}

function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  const useDarkTheme = isDarkTheme(preference);
  const root = document.documentElement;

  root.classList.toggle("dark", useDarkTheme);
  root.style.colorScheme = useDarkTheme ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);

  const setTheme = useCallback((preference: ThemePreference) => {
    setThemeState(preference);
    applyTheme(preference);

    try {
      window.localStorage.setItem(themeStorageKey, preference);
    } catch {
      // Theme persistence is a progressive enhancement.
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia(systemDarkQuery);
    const handleSystemThemeChange = () => applyTheme("system");

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [theme]);

  const value = useMemo(
    () => ({
      setTheme,
      theme,
    }),
    [setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useBlueprintTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useBlueprintTheme must be used within ThemeProvider.");
  }

  return context;
}
