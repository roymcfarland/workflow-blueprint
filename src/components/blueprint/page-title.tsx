import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageTitleProps = {
  actions?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  title: string;
};

export function PageTitle({ actions, className, description, eyebrow, title }: PageTitleProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {eyebrow ? <p className="blueprint-eyebrow">{eyebrow}</p> : null}
      {actions ? (
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 blueprint-display text-3xl leading-[1] text-text-primary sm:text-4xl">
            {title}
          </h1>
          <div className="shrink-0 pt-1">{actions}</div>
        </div>
      ) : (
        <h1 className="blueprint-display text-3xl leading-[1] text-text-primary sm:text-4xl">
          {title}
        </h1>
      )}
      <div className="h-1 w-24 rounded-full bg-brand sm:w-32" />
      {description ? (
        <p className="max-w-3xl text-base text-text-muted">{description}</p>
      ) : null}
    </div>
  );
}
