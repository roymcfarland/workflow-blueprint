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
          "inline-flex items-center justify-center gap-2 rounded-[1.1rem] border-2 border-ink px-5 py-3 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink-soft disabled:cursor-not-allowed disabled:opacity-55",
          variant === "primary" &&
            "blueprint-fill text-white shadow-[0_10px_24px_rgba(31,80,242,0.18)] hover:-translate-y-0.5",
          variant === "outline" &&
            "bg-white/70 text-ink hover:bg-white hover:-translate-y-0.5 dark:bg-paper dark:hover:bg-paper-strong",
          variant === "ghost" &&
            "border-transparent bg-transparent text-ink hover:border-ink/40 hover:bg-white/50 dark:hover:bg-white/5",
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
