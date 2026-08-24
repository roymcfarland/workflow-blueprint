// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UserRole } from "@/generated/prisma/client";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "@/components/app-shell";
import type { BoardNavItem } from "@/lib/data";
import {
  boardAccentFillColors,
  boardAccentPalette,
  getBoardAccentFillColor,
} from "@/lib/domain";

const navigationMock = vi.hoisted(() => ({
  pathname: "/dashboard",
  push: vi.fn(),
  refresh: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: ReactNode; href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({
    push: navigationMock.push,
    refresh: navigationMock.refresh,
  }),
}));

vi.mock("@/components/providers/theme-provider", () => ({
  useBlueprintTheme: () => ({
    setTheme: navigationMock.setTheme,
  }),
}));

const boards: BoardNavItem[] = [
  { iconKey: "briefcase", name: "Launch Plan", slug: "launch-plan" },
  { iconKey: "calendar", name: "Release Plan", slug: "release-plan" },
];

const user = {
  avatarLabel: null,
  email: "alex@example.test",
  isDemo: false,
  name: "Alex Blueprint",
  role: "USER" as UserRole,
  themePreference: "day" as const,
};

const adminUser = { ...user, role: "ADMIN" as UserRole };

function renderShell(shellUser = user, shellBoards = boards) {
  return render(
    <AppShell boards={shellBoards} user={shellUser}>
      <div>Shell content</div>
    </AppShell>,
  );
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function expectWordmarkHidden() {
  expect(screen.queryByText("Workflow")).toBeNull();
  expect(screen.queryByText("Blueprint")).toBeNull();
}

function expectWordmarkVisible() {
  expect(screen.getByText("Workflow")).toBeDefined();
  expect(screen.getByText("Blueprint")).toBeDefined();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function stubRect(element: Element, rect: Partial<DOMRect>) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    bottom: 0,
    height: 40,
    left: 0,
    right: 0,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    ...rect,
  } as DOMRect);
}

function dragReleasePlanBeforeLaunchPlan() {
  const launchPlan = screen.getByRole("link", { name: "Launch Plan" }).closest("div.relative");
  const releasePlan = screen
    .getByRole("link", { name: "Release Plan" })
    .closest("div.relative");
  if (!launchPlan || !releasePlan) {
    throw new Error("Expected sortable board containers.");
  }

  stubRect(launchPlan, { bottom: 40, top: 0 });
  stubRect(releasePlan, { bottom: 80, top: 40 });

  const handle = screen.getByRole("button", { name: "Reorder Release Plan" });
  fireEvent.mouseDown(handle, { button: 0, clientX: 20, clientY: 60 });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 50 });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 35 });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
  fireEvent.mouseUp(document, { button: 0, clientX: 20, clientY: 20 });
}

function dragReleasePlanOntoItself() {
  const launchPlan = screen.getByRole("link", { name: "Launch Plan" }).closest("div.relative");
  const releasePlan = screen
    .getByRole("link", { name: "Release Plan" })
    .closest("div.relative");
  if (!launchPlan || !releasePlan) {
    throw new Error("Expected sortable board containers.");
  }

  stubRect(launchPlan, { bottom: 40, top: 0 });
  stubRect(releasePlan, { bottom: 80, top: 40 });

  const handle = screen.getByRole("button", { name: "Reorder Release Plan" });
  fireEvent.mouseDown(handle, { button: 0, clientX: 20, clientY: 60 });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 68 });
  fireEvent.mouseMove(document, { clientX: 20, clientY: 68 });
  expect(releasePlan.className).toContain("opacity-60");
  fireEvent.mouseUp(document, { button: 0, clientX: 20, clientY: 68 });

  return releasePlan;
}

function boardLinkNames() {
  return screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.startsWith("/boards/"))
    .map((link) => link.textContent?.trim() ?? "");
}

function useMobileViewport() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 800,
    writable: true,
  });
}

function openMobileNavigation() {
  fireEvent.click(screen.getByRole("button", { name: "Open mobile navigation" }));
  expect(screen.getByRole("button", { name: "Close navigation overlay" })).toBeDefined();
}

function expectMobileNavigationClosed() {
  expect(screen.getByRole("button", { name: "Open mobile navigation" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Close navigation overlay" })).toBeNull();
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  navigationMock.pathname = "/dashboard";
  navigationMock.push.mockReset();
  navigationMock.refresh.mockReset();
  navigationMock.setTheme.mockReset();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1280,
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("AppShell collapsible sidebar", () => {
  test("renders expanded by default", () => {
    renderShell();

    expectWordmarkVisible();
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeDefined();
  });

  test("collapses when the collapse toggle is clicked", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expectWordmarkHidden();
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeDefined();
  });

  test("expands again when the expand toggle is clicked", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expectWordmarkVisible();
  });

  test("persists the collapsed state to localStorage", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(localStorage.getItem("wb.sidebar.collapsed")).toBe("1");
  });

  test("rehydrates a persisted collapsed state on mount", async () => {
    localStorage.setItem("wb.sidebar.collapsed", "1");

    renderShell();
    await act(async () => {
      await Promise.resolve();
    });

    expectWordmarkHidden();
  });

  test("keeps the sidebar expanded when stored state cannot be read", () => {
    const queuedMicrotasks: VoidFunction[] = [];
    const queueMicrotask = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((callback) => queuedMicrotasks.push(callback));
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    try {
      renderShell();
      expect(queuedMicrotasks).toHaveLength(2);
      act(() => queuedMicrotasks.forEach((callback) => callback()));
      expect(getItemSpy).toHaveBeenCalled();
    } finally {
      getItemSpy.mockRestore();
      queueMicrotask.mockRestore();
    }

    expectWordmarkVisible();
  });

  test("keeps the mobile menu button path working below the lg breakpoint", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
      writable: true,
    });
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Open mobile navigation" }));

    expectWordmarkVisible();
    expect(screen.getByRole("button", { name: "Close navigation overlay" })).toBeDefined();
  });
});

describe("AppShell board reordering", () => {
  test("shows reorder controls while expanded and removes them when collapsed", () => {
    renderShell();

    expect(screen.getByRole("button", { name: "Reorder Launch Plan" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reorder Release Plan" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByRole("button", { name: "Reorder Launch Plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reorder Release Plan" })).toBeNull();
  });

  test("gives reorder handles an explicit 24 by 24 pixel target", () => {
    renderShell();

    const handle = screen.getByRole("button", { name: "Reorder Launch Plan" });
    expect(handle.className).toContain("h-6");
    expect(handle.className).toContain("w-6");
    expect(handle.className).toContain("items-center");
    expect(handle.className).toContain("justify-center");
    expect(handle.querySelector("svg")?.getAttribute("class")).toContain("h-4 w-4");
  });

  test("keeps board links pointed at their boards", () => {
    renderShell();

    expect(screen.getByRole("link", { name: "Launch Plan" }).getAttribute("href")).toBe(
      "/boards/launch-plan",
    );
    expect(screen.getByRole("link", { name: "Release Plan" }).getAttribute("href")).toBe(
      "/boards/release-plan",
    );
  });

  test("normalizes the root pathname without activating a navigation item", () => {
    navigationMock.pathname = "/";

    renderShell();

    expect(screen.getByRole("link", { name: "Dashboard" }).className).not.toContain(
      "blueprint-fill",
    );
    expect(screen.getByRole("link", { name: "Launch Plan" }).className).not.toContain(
      "blueprint-hatch",
    );
  });

  test("applies active styling and the accent color to the current board", () => {
    navigationMock.pathname = "/boards/launch-plan";

    renderShell();

    const activeBoard = screen.getByRole("link", { name: "Launch Plan" });
    expect(activeBoard.className).toContain("blueprint-hatch");
    expect(activeBoard.style.getPropertyValue("--board-accent")).not.toBe("");
    expect(activeBoard.style.backgroundColor).not.toBe("");
  });

  test("uses the darkened fill for an active board with a failing raw accent", () => {
    navigationMock.pathname = "/boards/launch-plan";

    renderShell(user, [
      { ...boards[0], accentColor: "#e0a93b" },
      { ...boards[1], accentColor: "#5ab7b9" },
    ]);

    const activeBoard = screen.getByRole("link", { name: "Launch Plan" });
    expect(activeBoard.className).toContain("blueprint-hatch");
    expect(activeBoard.style.backgroundColor).toBe("rgb(152, 109, 24)");
    expect(activeBoard.style.borderColor).toBe("rgb(152, 109, 24)");
    expect(activeBoard.style.backgroundColor).not.toBe("rgb(224, 169, 59)");
  });

  test("keeps the raw accent on an inactive board icon", () => {
    renderShell(user, [
      { ...boards[0], accentColor: "#e0a93b" },
      { ...boards[1], accentColor: "#5ab7b9" },
    ]);

    const inactiveBoard = screen.getByRole("link", { name: "Launch Plan" });
    expect(inactiveBoard.style.getPropertyValue("--board-accent")).toBe("#e0a93b");
    expect(inactiveBoard.querySelector("svg")?.getAttribute("class")).toContain(
      "text-[var(--board-accent)]",
    );
    expect(getBoardAccentFillColor("outside-the-palette")).toBe("outside-the-palette");
  });

  test.each(boardAccentPalette)("keeps white contrast at or above 4.5:1 for %s", (accent) => {
    expect(contrastRatio("#ffffff", boardAccentFillColors[accent])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("AppShell demo banner", () => {
  test("shows the demo sandbox banner for demo accounts", () => {
    renderShell({ ...user, isDemo: true });
    expect(
      screen.getByText(
        "You’re exploring a demo sandbox — changes are temporary and reset periodically.",
      ),
    ).toBeDefined();
  });

  test("hides the demo sandbox banner for real accounts", () => {
    renderShell();
    expect(screen.queryByText(/demo sandbox/i)).toBeNull();
  });

  test("the demo banner shows an Exit Demo Sandbox button", () => {
    renderShell({ ...user, isDemo: true });

    expect(screen.getByRole("button", { name: "Exit Demo Sandbox" })).toBeDefined();
  });

  test("clicking Exit Demo Sandbox signs out and returns to the landing page", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderShell({ ...user, isDemo: true });
    fireEvent.click(screen.getByRole("button", { name: "Exit Demo Sandbox" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/sign-out",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(navigationMock.push).toHaveBeenCalledWith("/"));

    vi.unstubAllGlobals();
  });
});

describe("AppShell wordmark", () => {
  test("wordmark links to the dashboard for non-demo users", () => {
    renderShell();

    const wordmark = screen.getByRole("link", { name: "Workflow Blueprint home" });
    expect(wordmark.getAttribute("href")).toBe("/dashboard");
  });

  test("wordmark becomes an exit control in a demo sandbox (no dashboard link)", () => {
    renderShell({ ...user, isDemo: true });

    expect(screen.queryByRole("link", { name: "Workflow Blueprint home" })).toBeNull();
    expect(screen.getByRole("button", { name: /leave the demo/i })).toBeDefined();
  });

  test("clicking the demo wordmark signs out and returns to the landing page", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderShell({ ...user, isDemo: true });
    fireEvent.click(screen.getByRole("button", { name: /leave the demo/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/sign-out",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(navigationMock.push).toHaveBeenCalledWith("/"));

    vi.unstubAllGlobals();
  });
});

describe("AppShell account menu", () => {
  test("keeps account actions hidden until the avatar trigger is clicked", () => {
    renderShell();

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByText("Sign out")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByRole("menu")).toBeDefined();
    expect(screen.getByText("Profile")).toBeDefined();
    expect(screen.getByText("Sign out")).toBeDefined();
  });

  test("does not surface Invitations for a non-admin", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.queryByText("Invitations")).toBeNull();
  });

  test("does not surface API tokens for a non-admin", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.queryByText("API tokens")).toBeNull();
  });

  test("surfaces an Invitations link for an admin", () => {
    renderShell(adminUser);

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const invitations = screen.getByRole("menuitem", { name: "Invitations" });
    expect(invitations).toBeDefined();
    expect(invitations.getAttribute("href")).toBe("/admin/invitations");
  });

  test("surfaces an API tokens link for an admin", () => {
    renderShell(adminUser);

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const apiTokens = screen.getByRole("menuitem", { name: "API tokens" });
    expect(apiTokens).toBeDefined();
    expect(apiTokens.getAttribute("href")).toBe("/admin/api-tokens");
  });

  test("closes the menu when a menu item is selected", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));

    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("AppShell transition fallback", () => {
  test("enables sidebar transitions when requestAnimationFrame is unavailable", () => {
    const originalRequestAnimationFrame = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: undefined,
    });

    try {
      renderShell();
      const sidebar = screen.getByRole("complementary", { name: "Primary navigation" });
      expect(sidebar.className).toContain("lg:transition-none");

      act(() => vi.advanceTimersByTime(0));

      expect(sidebar.className).not.toContain("lg:transition-none");
    } finally {
      if (originalRequestAnimationFrame) {
        Object.defineProperty(window, "requestAnimationFrame", originalRequestAnimationFrame);
      }
    }
  });

  test("does not enable transitions when a queued animation frame fires after unmount", () => {
    let enableTransitions: FrameRequestCallback | undefined;
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        enableTransitions = callback;
        return 17;
      });
    const cancelAnimationFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});

    try {
      const { unmount } = renderShell();
      unmount();
      expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
      if (!enableTransitions) {
        throw new Error("Expected AppShell to schedule a transition animation frame.");
      }

      act(() => enableTransitions!(0));
    } finally {
      requestAnimationFrame.mockRestore();
      cancelAnimationFrame.mockRestore();
    }

    expect(screen.queryByText("Shell content")).toBeNull();
  });
});

describe("AppShell mount cleanup", () => {
  test("ignores queued mount microtasks after a synchronous unmount", async () => {
    const { unmount } = renderShell();

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("Shell content")).toBeNull();
  });
});

describe("AppShell theme switching", () => {
  test("rolls back an optimistic theme change when persistence fails", async () => {
    vi.useRealTimers();
    const request = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal("fetch", fetchMock);

    try {
      renderShell();
      fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
      navigationMock.setTheme.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Night" }));

      expect(navigationMock.setTheme).toHaveBeenCalledWith("night");
      const optimisticCallCount = navigationMock.setTheme.mock.calls.length;
      expect(
        navigationMock.setTheme.mock.calls.every(([theme]) => theme === "night"),
      ).toBe(true);

      await act(async () => {
        request.resolve(new Response(null, { status: 500 }));
        await request.promise;
      });

      await waitFor(() =>
        expect(
          navigationMock.setTheme.mock.calls
            .slice(optimisticCallCount)
            .some(([theme]) => theme === "day"),
        ).toBe(true),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/theme",
        expect.objectContaining({
          body: JSON.stringify({ themePreference: "night" }),
          method: "PATCH",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("keeps an optimistic theme change when persistence succeeds", async () => {
    vi.useRealTimers();
    const request = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal("fetch", fetchMock);

    try {
      renderShell();
      fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
      navigationMock.setTheme.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Night" }));

      await act(async () => {
        request.resolve(new Response(null, { status: 200 }));
        await request.promise;
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/theme",
        expect.objectContaining({
          body: JSON.stringify({ themePreference: "night" }),
          method: "PATCH",
        }),
      );
      expect(navigationMock.setTheme).toHaveBeenCalledWith("night");
      expect(navigationMock.setTheme.mock.calls.some(([theme]) => theme === "day")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("AppShell board reorder interactions", () => {
  test("persists a board order changed with the drag handle", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      renderShell();
      await act(async () => {
        await Promise.resolve();
      });
      dragReleasePlanBeforeLaunchPlan();
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/boards/reorder",
          expect.objectContaining({
            body: JSON.stringify({ boardSlugs: ["release-plan", "launch-plan"] }),
            method: "POST",
          }),
        ),
      );
      expect(boardLinkNames()).toEqual(["Release Plan", "Launch Plan"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("reverts a failed board reorder and shows the persistence error", async () => {
    vi.useRealTimers();
    const request = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal("fetch", fetchMock);

    try {
      renderShell();
      await act(async () => {
        await Promise.resolve();
      });
      dragReleasePlanBeforeLaunchPlan();
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(boardLinkNames()).toEqual(["Release Plan", "Launch Plan"]));

      await act(async () => {
        request.resolve(new Response(null, { status: 500 }));
        await request.promise;
      });

      expect(await screen.findByText("Unable to save the new order.")).toBeDefined();
      await waitFor(() => expect(boardLinkNames()).toEqual(["Launch Plan", "Release Plan"]));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("does not persist a board dropped onto itself", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      renderShell();
      await act(async () => {
        await Promise.resolve();
      });

      const draggedBoard = dragReleasePlanOntoItself();
      act(() => vi.advanceTimersByTime(50));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(draggedBoard.className).not.toContain("opacity-60");
      expect(boardLinkNames()).toEqual(["Launch Plan", "Release Plan"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("AppShell mobile navigation close interactions", () => {
  test("lets the mobile drawer scroll on short viewports", () => {
    useMobileViewport();
    renderShell();
    openMobileNavigation();

    expect(
      screen.getByRole("complementary", { name: "Primary navigation" }).className,
    ).toContain("overflow-y-auto");
  });

  test("keeps the mobile close button at its declared touch target size", () => {
    useMobileViewport();
    renderShell();
    openMobileNavigation();

    const closeButton = screen.getByRole("button", { name: "Close navigation" });
    expect(closeButton.className).toContain("h-10 w-10");
    expect(closeButton.className).toContain("shrink-0");
  });

  test("closes from the in-sidebar close button", () => {
    useMobileViewport();
    renderShell();
    openMobileNavigation();

    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));

    expectMobileNavigationClosed();
  });

  test("closes from the wordmark, dashboard, and expanded board links", () => {
    useMobileViewport();
    renderShell();

    openMobileNavigation();
    fireEvent.click(screen.getByRole("link", { name: "Workflow Blueprint home" }));
    expectMobileNavigationClosed();

    openMobileNavigation();
    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    expectMobileNavigationClosed();

    openMobileNavigation();
    fireEvent.click(screen.getByRole("link", { name: "Launch Plan" }));
    expectMobileNavigationClosed();
  });

  test("keeps mobile navigation closed when a collapsed board link is selected", () => {
    useMobileViewport();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    fireEvent.click(screen.getByRole("link", { name: "Launch Plan" }));

    expectMobileNavigationClosed();
  });

  test("closes from the mobile overlay backdrop", () => {
    useMobileViewport();
    renderShell();
    openMobileNavigation();

    fireEvent.click(screen.getByRole("button", { name: "Close navigation overlay" }));

    expectMobileNavigationClosed();
  });
});

describe("AppShell account menu close interactions", () => {
  test("closes the account menu from its invisible backdrop", () => {
    const { container } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const backdrop = container.querySelector('button[aria-hidden="true"]');
    if (!backdrop) {
      throw new Error("Expected the account menu backdrop.");
    }

    fireEvent.click(backdrop);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("admin links close both the account menu and mobile navigation", () => {
    useMobileViewport();
    renderShell(adminUser);

    openMobileNavigation();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Invitations" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expectMobileNavigationClosed();

    openMobileNavigation();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API tokens" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expectMobileNavigationClosed();
  });

  test("signs out from the account menu and returns to the landing page", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      renderShell();
      fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/auth/sign-out",
          expect.objectContaining({ method: "POST" }),
        ),
      );
      await waitFor(() => expect(navigationMock.push).toHaveBeenCalledWith("/"));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
