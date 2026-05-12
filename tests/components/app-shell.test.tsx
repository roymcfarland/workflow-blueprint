// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "@/components/app-shell";
import type { BoardNavItem } from "@/lib/data";

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
];

const user = {
  avatarLabel: null,
  email: "alex@example.test",
  name: "Alex Blueprint",
  role: "USER" as const,
  themePreference: "day" as const,
};

function renderShell() {
  return render(
    <AppShell boards={boards} user={user}>
      <div>Shell content</div>
    </AppShell>,
  );
}

function getSidebar() {
  return screen.getByLabelText("Primary navigation");
}

function expectWordmarkHidden() {
  expect(screen.queryByText("Workflow")).toBeNull();
  expect(screen.queryByText("Blueprint")).toBeNull();
}

function expectWordmarkVisible() {
  expect(screen.getByText("Workflow")).toBeDefined();
  expect(screen.getByText("Blueprint")).toBeDefined();
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

describe("AppShell hover sidebar", () => {
  test("renders the desktop rail by default", () => {
    renderShell();

    expectWordmarkHidden();
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.queryByText("Launch Plan")).toBeNull();
    expect(screen.getByRole("button", { name: "Pin sidebar open" })).toBeDefined();
  });

  test("expands after a 300ms hover dwell", () => {
    renderShell();

    fireEvent.mouseEnter(getSidebar());
    act(() => vi.advanceTimersByTime(300));

    expectWordmarkVisible();
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getAllByText("Launch Plan").length).toBeGreaterThan(0);
  });

  test("does not expand when hover ends before the 300ms dwell", () => {
    renderShell();

    fireEvent.mouseEnter(getSidebar());
    act(() => vi.advanceTimersByTime(250));
    fireEvent.mouseLeave(getSidebar());

    expectWordmarkHidden();
  });

  test("collapses after the 500ms mouseleave grace", () => {
    renderShell();

    fireEvent.mouseEnter(getSidebar());
    act(() => vi.advanceTimersByTime(300));
    expectWordmarkVisible();

    fireEvent.mouseLeave(getSidebar());
    act(() => vi.advanceTimersByTime(500));

    expectWordmarkHidden();
  });

  test("cancels collapse when the cursor re-enters during the grace window", () => {
    renderShell();

    fireEvent.mouseEnter(getSidebar());
    act(() => vi.advanceTimersByTime(300));
    fireEvent.mouseLeave(getSidebar());
    act(() => vi.advanceTimersByTime(300));
    fireEvent.mouseEnter(getSidebar());
    act(() => vi.advanceTimersByTime(500));

    expectWordmarkVisible();
  });

  test("pinning locks the sidebar open across hover events", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Pin sidebar open" }));
    expectWordmarkVisible();

    fireEvent.mouseLeave(getSidebar());
    act(() => vi.advanceTimersByTime(1000));

    expectWordmarkVisible();
  });

  test("persists the pinned state to localStorage", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Pin sidebar open" }));

    expect(localStorage.getItem("wb.sidebar.pinned")).toBe("1");
  });

  test("rehydrates a persisted pinned state on mount", async () => {
    localStorage.setItem("wb.sidebar.pinned", "1");

    renderShell();
    await act(async () => {
      await Promise.resolve();
    });

    expectWordmarkVisible();
  });

  test("expands immediately when a nav link receives keyboard focus", () => {
    renderShell();

    fireEvent.focus(screen.getByRole("link", { name: "Dashboard" }));

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
