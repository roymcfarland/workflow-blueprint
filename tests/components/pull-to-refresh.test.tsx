// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PullToRefresh from "@/components/pull-to-refresh";

function touchEvent(type: string, clientY: number, target: EventTarget = document.body) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: [{ clientY, target }], configurable: true });
  Object.defineProperty(event, "target", { value: target, configurable: true });
  return event;
}

function stubStandaloneTouchApp(isStandalone: boolean) {
  vi.stubGlobal("navigator", {
    ...navigator,
    maxTouchPoints: isStandalone ? 5 : 0,
    standalone: isStandalone,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isStandalone && query.includes("standalone"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    writable: true,
  });
}

beforeEach(() => {
  stubStandaloneTouchApp(true);
  Object.defineProperty(document, "scrollingElement", {
    configurable: true,
    value: { scrollTop: 0 },
  });
  vi.stubGlobal("location", { reload: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PullToRefresh", () => {
  test("reloads after a full pull gesture past the threshold", () => {
    render(<PullToRefresh />);

    document.dispatchEvent(touchEvent("touchstart", 0));
    document.dispatchEvent(touchEvent("touchmove", 150));
    document.dispatchEvent(touchEvent("touchend", 150));

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  test("does not reload if the pull doesn't reach the threshold", () => {
    render(<PullToRefresh />);

    document.dispatchEvent(touchEvent("touchstart", 0));
    document.dispatchEvent(touchEvent("touchmove", 20));
    document.dispatchEvent(touchEvent("touchend", 20));

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  test("does nothing when not a standalone touch app", () => {
    stubStandaloneTouchApp(false);
    render(<PullToRefresh />);

    document.dispatchEvent(touchEvent("touchstart", 0));
    document.dispatchEvent(touchEvent("touchmove", 150));
    document.dispatchEvent(touchEvent("touchend", 150));

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  test("recognizes an iOS standalone app when the display-mode query does not match", () => {
    const matchMediaSpy = vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          addEventListener: vi.fn(),
          addListener: vi.fn(),
          dispatchEvent: vi.fn(),
          matches: false,
          media: query,
          onchange: null,
          removeEventListener: vi.fn(),
          removeListener: vi.fn(),
        }) satisfies MediaQueryList,
    );

    try {
      render(<PullToRefresh />);

      document.dispatchEvent(touchEvent("touchstart", 0));
      document.dispatchEvent(touchEvent("touchmove", 150));
      document.dispatchEvent(touchEvent("touchend", 150));

      expect(window.location.reload).toHaveBeenCalledTimes(1);
    } finally {
      matchMediaSpy.mockRestore();
    }
  });

  test("falls back to the document element when scrollingElement is null", () => {
    const scrollingElementDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "scrollingElement",
    );
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: null,
    });

    try {
      render(<PullToRefresh />);

      document.dispatchEvent(touchEvent("touchstart", 0));
      document.dispatchEvent(touchEvent("touchmove", 150));
      document.dispatchEvent(touchEvent("touchend", 150));

      expect(window.location.reload).toHaveBeenCalledTimes(1);
    } finally {
      if (scrollingElementDescriptor) {
        Object.defineProperty(document, "scrollingElement", scrollingElementDescriptor);
      }
    }
  });

  test("starts a pull when the event target is not an element", () => {
    render(<PullToRefresh />);

    document.dispatchEvent(touchEvent("touchstart", 0, document));
    document.dispatchEvent(touchEvent("touchmove", 150, document));
    document.dispatchEvent(touchEvent("touchend", 150, document));

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  test("ignores a pull started on an input element", () => {
    render(<PullToRefresh />);
    const input = document.createElement("input");
    document.body.appendChild(input);

    document.dispatchEvent(touchEvent("touchstart", 0, input));
    document.dispatchEvent(touchEvent("touchmove", 150));
    document.dispatchEvent(touchEvent("touchend", 150));

    expect(window.location.reload).not.toHaveBeenCalled();
    input.remove();
  });

  test("ignores a pull when the document or a scrollable ancestor isn't at the top", () => {
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: { scrollTop: 40 },
    });
    render(<PullToRefresh />);

    document.dispatchEvent(touchEvent("touchstart", 0));
    document.dispatchEvent(touchEvent("touchmove", 150));
    document.dispatchEvent(touchEvent("touchend", 150));

    expect(window.location.reload).not.toHaveBeenCalled();

    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: { scrollTop: 0 },
    });
    const scrollable = document.createElement("div");
    const child = document.createElement("div");
    scrollable.style.overflowY = "auto";
    Object.defineProperties(scrollable, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 40 },
    });
    scrollable.appendChild(child);
    document.body.appendChild(scrollable);

    document.dispatchEvent(touchEvent("touchstart", 0, child));
    document.dispatchEvent(touchEvent("touchmove", 150, child));
    document.dispatchEvent(touchEvent("touchend", 150, child));

    expect(window.location.reload).not.toHaveBeenCalled();
    scrollable.remove();
  });

  test("removes its listeners on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<PullToRefresh />);

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("touchstart", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("touchmove", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("touchend", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("touchcancel", expect.any(Function));
  });

  test("shows a refreshing spinner once the pull threshold is met", () => {
    render(<PullToRefresh />);

    act(() => {
      document.dispatchEvent(touchEvent("touchstart", 0));
      document.dispatchEvent(touchEvent("touchmove", 150));
      document.dispatchEvent(touchEvent("touchend", 150));
    });

    expect(screen.getByRole("status").textContent).toBe("Refreshing…");
  });

  test("does not show a refreshing spinner if the pull doesn't reach the threshold", () => {
    render(<PullToRefresh />);

    document.dispatchEvent(touchEvent("touchstart", 0));
    document.dispatchEvent(touchEvent("touchmove", 20));
    document.dispatchEvent(touchEvent("touchend", 20));

    expect(screen.queryByRole("status")).toBeNull();
  });
});
