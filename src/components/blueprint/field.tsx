import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FieldProps = {
  children: ReactNode;
  className?: string;
  description?: string;
  error?: string | null;
  htmlFor?: string;
  label: string;
};

export function Field({ children, className, description, error, htmlFor, label }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-sm font-semibold text-text-primary" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {description && !error ? (
        <p className="text-xs text-text-muted">{description}</p>
      ) : null}
      {error ? <p className="text-xs font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
