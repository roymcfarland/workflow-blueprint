import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BlueprintCardProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * "blur" (default) uses backdrop-blur; reserve for top-level/page surfaces.
   * "flat" drops the blur — use for inner cards on dense pages for scroll perf.
   */
  surface?: "blur" | "flat";
};

export function BlueprintCard({ className, surface = "blur", ...props }: BlueprintCardProps) {
  return (
    <div
      className={cn(
        surface === "blur" ? "blueprint-surface" : "blueprint-surface-flat",
        "blueprint-surface-strong",
        className,
      )}
      {...props}
    />
  );
}
