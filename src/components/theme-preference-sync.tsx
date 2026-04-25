"use client";

import { useEffect } from "react";

import { useBlueprintTheme } from "@/components/providers/theme-provider";
import type { ThemePreference } from "@/lib/domain";

export function ThemePreferenceSync({ preference }: { preference: ThemePreference }) {
  const { setTheme } = useBlueprintTheme();

  useEffect(() => {
    setTheme(preference);
  }, [preference, setTheme]);

  return null;
}
