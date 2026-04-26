import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils";

type BlueprintButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "outline" | "ghost";
};

export const BlueprintButton = React.forwardRef<HTMLButtonElement, BlueprintButtonProps>(
  ({ asChild, className, variant = "primary", type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong px-4 py-2.5 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-55",
          variant === "primary" &&
            "blueprint-fill text-white shadow-[0_10px_22px_rgba(31,79,207,0.18)] hover:-translate-y-0.5",
          variant === "outline" &&
            "bg-surface-control text-text-primary hover:-translate-y-0.5 hover:bg-surface-control-hover",
          variant === "ghost" &&
            "border-transparent bg-transparent text-text-primary hover:border-line-soft hover:bg-surface-control-hover",
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);

BlueprintButton.displayName = "BlueprintButton";
