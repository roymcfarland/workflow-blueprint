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
    <div className={cn("flex items-center gap-4", className)}>
      {label ? <span className="blueprint-title text-xl text-ink">{label}</span> : null}
      <div className="blueprint-outline inline-flex overflow-hidden rounded-full p-0.5">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              className={cn(
                "min-w-[5.25rem] rounded-full px-4 py-2.5 text-lg font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink-soft sm:min-w-28 sm:px-5",
                active ? "blueprint-fill text-white" : "text-ink hover:bg-white/70 dark:hover:bg-white/6",
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
