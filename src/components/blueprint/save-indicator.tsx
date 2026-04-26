import { Check, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type SaveIndicatorProps = {
  className?: string;
  message?: string | null;
  status: SaveStatus;
};

const statusCopy: Record<Exclude<SaveStatus, "idle">, string> = {
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save",
};

export function SaveIndicator({ className, message, status }: SaveIndicatorProps) {
  if (status === "idle") {
    return null;
  }

  const label = message ?? statusCopy[status];

  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        status === "saving" && "text-text-muted",
        status === "saved" && "text-success",
        status === "error" && "text-danger",
        className,
      )}
      role="status"
    >
      {status === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {status === "saved" ? <Check className="h-3.5 w-3.5" /> : null}
      {status === "error" ? <TriangleAlert className="h-3.5 w-3.5" /> : null}
      <span>{label}</span>
    </span>
  );
}
