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
        "blueprint-control min-h-32 w-full rounded-lg px-4 py-3 text-base outline-none transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
        className,
      )}
      {...props}
    />
  );
});

BlueprintTextarea.displayName = "BlueprintTextarea";
