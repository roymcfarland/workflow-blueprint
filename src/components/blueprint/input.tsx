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
        "h-16 w-full rounded-[1.15rem] border-2 border-ink bg-white/92 px-4 text-base text-ink placeholder:text-ink-muted shadow-[0_10px_20px_rgba(31,80,242,0.06)] outline-none transition focus-visible:ring-4 focus-visible:ring-ink-soft dark:bg-paper-strong",
        className,
      )}
      {...props}
    />
  );
});

BlueprintInput.displayName = "BlueprintInput";
