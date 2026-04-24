import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function BlueprintCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("blueprint-surface blueprint-surface-strong", className)} {...props} />;
}
