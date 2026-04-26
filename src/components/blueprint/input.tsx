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
        "blueprint-control h-11 w-full rounded-lg px-4 text-base outline-none transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
        className,
      )}
      {...props}
    />
  );
});

BlueprintInput.displayName = "BlueprintInput";
