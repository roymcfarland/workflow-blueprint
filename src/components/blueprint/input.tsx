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
        "blueprint-control h-12 w-full rounded-lg px-4 text-base outline-none transition focus-visible:ring-4 focus-visible:ring-brand-soft",
        className,
      )}
      {...props}
    />
  );
});

BlueprintInput.displayName = "BlueprintInput";
