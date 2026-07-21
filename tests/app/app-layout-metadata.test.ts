// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const appShellMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  getShellSnapshot: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: (props: { children: ReactNode }) => {
    appShellMock(props);

    return createElement("div", { "data-testid": "app-shell" }, props.children);
  },
}));

import ProtectedLayout, { metadata } from "@/app/(app)/layout";
import { getCurrentUser } from "@/lib/auth";
import { getShellSnapshot } from "@/lib/data";

beforeEach(() => {
  appShellMock.mockReset();
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getShellSnapshot).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ProtectedLayout metadata", () => {
  test("is marked noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("ProtectedLayout", () => {
  test("redirects to / when there is no authenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    await expect(
      ProtectedLayout({ children: createElement("div", null, "content") }),
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(getShellSnapshot).not.toHaveBeenCalled();
  });

  test("redirects to / when the shell snapshot is unavailable", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
    vi.mocked(getShellSnapshot).mockResolvedValueOnce(null);

    await expect(
      ProtectedLayout({ children: createElement("div", null, "content") }),
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(getShellSnapshot).toHaveBeenCalledWith("user-1");
  });

  test("renders AppShell with the fetched boards and user", async () => {
    const shellUser = { id: "user-1", name: "Alex", themePreference: "day" } as never;
    const boards = [{ slug: "launch-plan", name: "Launch Plan" }] as never;
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
    vi.mocked(getShellSnapshot).mockResolvedValueOnce({ user: shellUser, boards });

    const element = await ProtectedLayout({
      children: createElement("div", null, "page content"),
    });
    render(element);

    expect(screen.getByTestId("app-shell")).toBeDefined();
    expect(screen.getByText("page content")).toBeDefined();
    expect(appShellMock).toHaveBeenCalledWith(
      expect.objectContaining({ boards, user: shellUser }),
    );
  });
});
