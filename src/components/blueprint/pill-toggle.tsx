"use client";

import { cn } from "@/lib/utils";

type PillOption<T extends string> = {
  label: string;
  value: T;
};

type BlueprintPillToggleProps<T extends string> = {
  className?: string;
  label?: string;
  onChange: (value: T) => void;
  options: readonly PillOption<T>[];
  value: T;
};

export function BlueprintPillToggle<T extends string>({
  className,
  label,
  onChange,
  options,
  value,
}: BlueprintPillToggleProps<T>) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)}>
      {label ? <span className="blueprint-eyebrow">{label}</span> : null}
      <div className="blueprint-outline inline-flex overflow-hidden p-0.5">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              className={cn(
                "min-w-[4rem] rounded-full px-3 py-1.5 text-sm font-semibold transition outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
                active
                  ? "blueprint-fill-flat text-white"
                  : "text-text-primary hover:bg-surface-control-hover",
              )}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
