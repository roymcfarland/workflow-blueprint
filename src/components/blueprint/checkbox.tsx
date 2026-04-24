import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BlueprintCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  description?: string;
};

export function BlueprintCheckbox({
  checked,
  className,
  description,
  label,
  ...props
}: BlueprintCheckboxProps) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm text-ink", className)}>
      <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-white/90">
        <input
          checked={checked}
          className="peer absolute inset-0 cursor-pointer opacity-0"
          type="checkbox"
          {...props}
        />
        <Check className="h-4 w-4 scale-0 text-ink transition peer-checked:scale-100" />
      </span>
      {(label || description) && (
        <span className="space-y-1">
          {label ? <span className="block font-semibold">{label}</span> : null}
          {description ? <span className="block text-ink-muted">{description}</span> : null}
        </span>
      )}
    </label>
  );
}
