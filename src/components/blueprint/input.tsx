import * as React from "react";

import { cn } from "@/lib/utils";

export const BlueprintInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-lg border border-ink bg-white/90 px-4 text-base text-ink placeholder:text-ink-muted shadow-[0_8px_18px_rgba(31,79,207,0.06)] outline-none transition focus-visible:ring-4 focus-visible:ring-ink-soft dark:bg-paper-strong",
        className,
      )}
      {...props}
    />
  );
});

BlueprintInput.displayName = "BlueprintInput";
