// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ToastProvider,
  type ToastVariant,
  useToast,
} from "@/components/providers/toast-provider";

function ToastButton({
  label,
  message,
  variant,
}: {
  label: string;
  message: string;
  variant?: ToastVariant;
}) {
  const { showToast } = useToast();

  return (
    <button onClick={() => showToast(message, variant)} type="button">
      {label}
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  test("shows the default success variant", () => {
    render(
      <ToastProvider>
        <ToastButton label="Show success" message="Changes saved." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));

    const toast = screen.getByText("Changes saved.").parentElement;
    expect(screen.getByRole("status")).toBeDefined();
    expect(toast?.classList.contains("text-success")).toBe(true);
    expect(toast?.querySelector("svg.lucide-check")).not.toBeNull();
    expect(toast?.querySelector("svg.lucide-triangle-alert")).toBeNull();
  });

  test("shows the explicit error variant", () => {
    render(
      <ToastProvider>
        <ToastButton label="Show error" message="Something failed." variant="error" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show error" }));

    const toast = screen.getByText("Something failed.").parentElement;
    expect(toast?.classList.contains("text-danger")).toBe(true);
    expect(toast?.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    expect(toast?.querySelector("svg.lucide-check")).toBeNull();
  });

  test("stacks multiple toasts", () => {
    render(
      <ToastProvider>
        <ToastButton label="Show first" message="First toast." />
        <ToastButton label="Show second" message="Second toast." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show first" }));
    fireEvent.click(screen.getByRole("button", { name: "Show second" }));

    expect(screen.getByText("First toast.")).toBeDefined();
    expect(screen.getByText("Second toast.")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(2);
  });

  test("dismisses only the selected toast", () => {
    render(
      <ToastProvider>
        <ToastButton label="Show first" message="First toast." />
        <ToastButton label="Show second" message="Second toast." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show first" }));
    fireEvent.click(screen.getByRole("button", { name: "Show second" }));
    fireEvent.click(
      screen.getByText("First toast.").parentElement?.querySelector("button") as HTMLButtonElement,
    );

    expect(screen.queryByText("First toast.")).toBeNull();
    expect(screen.getByText("Second toast.")).toBeDefined();
  });

  test("auto-dismisses a toast after four seconds", () => {
    render(
      <ToastProvider>
        <ToastButton label="Show timed toast" message="Brief notice." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show timed toast" }));
    expect(screen.getByText("Brief notice.")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Brief notice.")).toBeNull();
  });

  test("uses a harmless no-op outside a provider", () => {
    render(<ToastButton label="Show no-op" message="Invisible notice." />);

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "Show no-op" }));
    }).not.toThrow();
    expect(screen.queryByText("Invisible notice.")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
