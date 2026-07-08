// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UserRole } from "@/generated/prisma/client";
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
  isDemo: false,
  name: "Alex Blueprint",
  role: "USER" as UserRole,
  themePreference: "day" as const,
};

const adminUser = { ...user, role: "ADMIN" as UserRole };

function renderShell(shellUser = user) {
  return render(
    <AppShell boards={boards} user={shellUser}>
      <div>Shell content</div>
    </AppShell>,
  );
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
