// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ResetPasswordPage, { metadata } from "@/app/reset-password/page";

afterEach(() => {
  cleanup();
});

describe("ResetPasswordPage", () => {
  test("is marked noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  test("calls notFound when the token is missing", async () => {
    await expect(ResetPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  test("renders the reset form with the token when present", async () => {
    const element = await ResetPasswordPage({
      searchParams: Promise.resolve({ token: "reset-token-abc" }),
    });
    const { container } = render(element);

    expect(screen.getByText("Choose a new password")).toBeTruthy();
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"]')?.value).toBe(
      "reset-token-abc",
    );
  });
});
