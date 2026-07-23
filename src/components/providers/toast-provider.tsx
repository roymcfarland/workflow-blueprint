"use client";

import { Check, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error";

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, variant }]);
      setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
        role="status"
      >
        {toasts.map((toast) => (
          <div
            className={cn(
              "blueprint-surface-flat pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold",
              toast.variant === "success" && "text-success",
              toast.variant === "error" && "text-danger",
            )}
            key={toast.id}
          >
            {toast.variant === "success" ? <Check className="h-4 w-4 shrink-0" /> : null}
            {toast.variant === "error" ? (
              <TriangleAlert className="h-4 w-4 shrink-0" />
            ) : null}
            <span>{toast.message}</span>
            <button
              aria-label="Dismiss notification"
              className="ml-1 shrink-0 text-text-muted transition hover:text-text-primary"
              onClick={() => dismissToast(toast.id)}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Unlike useBlueprintTheme, this deliberately does not throw outside a
// ToastProvider because existing component tests render toast consumers directly.
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    return { showToast: () => {} };
  }

  return context;
}
