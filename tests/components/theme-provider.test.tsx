// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ThemeProvider,
  useBlueprintTheme,
} from "@/components/providers/theme-provider";

let mediaMatches: boolean;
let changeListener: EventListener | null;
let addEventListenerMock: ReturnType<typeof vi.fn>;
let removeEventListenerMock: ReturnType<typeof vi.fn>;

function Consumer() {
  const { setTheme, theme } = useBlueprintTheme();

  return (
    <>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme("day")}>
        Use day
      </button>
      <button type="button" onClick={() => setTheme("night")}>
        Use night
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        Use system
      </button>
    </>
  );
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <Consumer />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mediaMatches = false;
  changeListener = null;
  addEventListenerMock = vi.fn((eventName: string, listener: EventListener) => {
    if (eventName === "change") {
      changeListener = listener;
    }
  });
  removeEventListenerMock = vi.fn();

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) =>
      ({
        addEventListener:
          addEventListenerMock as unknown as MediaQueryList["addEventListener"],
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: mediaMatches,
        media: query,
        onchange: null,
        removeEventListener:
          removeEventListenerMock as unknown as MediaQueryList["removeEventListener"],
        removeListener: vi.fn(),
      }) satisfies MediaQueryList,
    ),
    writable: true,
  });
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});

describe("ThemeProvider", () => {
  test("defaults to day when no theme is stored", () => {
    vi.spyOn(window.localStorage, "getItem").mockReturnValue(null);

    renderProvider();

    expect(screen.getByTestId("theme").textContent).toBe("day");
  });

  test("reads a valid stored theme", () => {
    localStorage.setItem("theme", "night");

    renderProvider();

    expect(screen.getByTestId("theme").textContent).toBe("night");
  });

  test("falls back to day for an invalid stored theme", () => {
    localStorage.setItem("theme", "midnight");

    renderProvider();

    expect(screen.getByTestId("theme").textContent).toBe("day");
  });

  test("sets, applies, and persists a night theme", () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Use night" }));

    expect(screen.getByTestId("theme").textContent).toBe("night");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("night");
  });

  test("applies the system theme when the system prefers dark", () => {
    mediaMatches = true;
    localStorage.setItem("theme", "system");

    renderProvider();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("reapplies system changes and removes its listener when the preference changes", () => {
    localStorage.setItem("theme", "system");
    renderProvider();

    expect(addEventListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
    const listener = changeListener;
    expect(listener).not.toBeNull();

    mediaMatches = true;
    act(() => listener?.(new Event("change")));

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Use day" }));

    expect(removeEventListenerMock).toHaveBeenCalledWith("change", listener);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("rejects useBlueprintTheme outside its provider", () => {
    expect(() => render(<Consumer />)).toThrow(
      "useBlueprintTheme must be used within ThemeProvider.",
    );
  });
});
