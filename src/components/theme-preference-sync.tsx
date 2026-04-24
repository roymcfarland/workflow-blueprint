"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import type { ThemePreference } from "@/lib/domain";

export function ThemePreferenceSync({ preference }: { preference: ThemePreference }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(preference);
  }, [preference, setTheme]);

  return null;
}
