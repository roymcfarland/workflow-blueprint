import * as React from "react";

import { cn } from "@/lib/utils";

export const BlueprintTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-32 w-full rounded-[1.15rem] border-2 border-ink bg-white/92 px-4 py-3 text-base text-ink placeholder:text-ink-muted shadow-[0_10px_20px_rgba(31,80,242,0.06)] outline-none transition focus-visible:ring-4 focus-visible:ring-ink-soft dark:bg-paper-strong",
        className,
      )}
      {...props}
    />
  );
});

BlueprintTextarea.displayName = "BlueprintTextarea";
