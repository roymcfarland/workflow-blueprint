import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils";

type BlueprintButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "hero" | "accent" | "outline" | "ghost";
};

export const BlueprintButton = React.forwardRef<HTMLButtonElement, BlueprintButtonProps>(
  ({ asChild, className, variant = "primary", type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong px-4 py-2.5 text-sm font-semibold transition duration-150 outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55",
          variant === "primary" &&
            "blueprint-fill-flat text-white hover:brightness-105 active:brightness-95",
          variant === "hero" &&
            "blueprint-fill text-white shadow-[0_10px_22px_rgba(31,79,207,0.18)] hover:-translate-y-0.5",
          variant === "accent" &&
            "blueprint-fill-accent border-accent-strong shadow-[0_8px_18px_rgba(216,144,32,0.25)] hover:brightness-105",
          variant === "outline" &&
            "bg-surface-control text-text-primary hover:bg-surface-control-hover",
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
