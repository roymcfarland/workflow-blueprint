// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import LoginPage from "@/app/page";
import { getCurrentUser } from "@/lib/auth";

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("LoginPage", () => {
  test("redirects to /dashboard when already signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);

    await expect(LoginPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  test("renders the login form when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const element = await LoginPage();
    render(element);

    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByText("Sign in to continue to Workflow Blueprint.")).toBeTruthy();
  });
});
