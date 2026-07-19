// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  getInvitationPreviewByToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SignUpPage, { metadata } from "@/app/sign-up/page";
import { getCurrentUser } from "@/lib/auth";
import { getInvitationPreviewByToken } from "@/lib/data";

function searchParams(params: Record<string, string> = {}) {
  return Promise.resolve(params);
}

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getInvitationPreviewByToken).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("SignUpPage", () => {
  test("is marked noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  test("redirects to /dashboard when already signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);

    await expect(SignUpPage({ searchParams: searchParams() })).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
    expect(getInvitationPreviewByToken).not.toHaveBeenCalled();
  });

  test("shows the invite-only message when no token is present", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const element = await SignUpPage({ searchParams: searchParams() });
    render(element);

    expect(
      screen.getByText("New Workflow Blueprint accounts require an invitation from an admin."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/");
  });

  test("shows the invitation-unavailable message when the token is invalid", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    vi.mocked(getInvitationPreviewByToken).mockResolvedValueOnce(null);

    const element = await SignUpPage({ searchParams: searchParams({ invite: "bad-token" }) });
    render(element);

    expect(
      screen.getByText("This invitation link is invalid, expired, revoked, or already accepted."),
    ).toBeTruthy();
  });

  test("renders the sign-up form when the token is valid", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    vi.mocked(getInvitationPreviewByToken).mockResolvedValueOnce({
      email: "alex@example.test",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });

    const element = await SignUpPage({ searchParams: searchParams({ invite: "good-token" }) });
    render(element);

    expect(screen.getByText("Accept invitation")).toBeTruthy();
    expect(screen.getByText("Invitation for alex@example.test")).toBeTruthy();
  });
});
