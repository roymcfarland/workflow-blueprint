// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("ForgotPasswordForm", () => {
  test("renders its email, submit, and return controls", () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/");
  });

  test("validates a missing email before submitting", async () => {
    const { container } = render(<ForgotPasswordForm />);

    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("Email is required.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows the generic response without a preview link", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse({ message: "If that account exists, a reset link has been prepared." }),
    );
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/forgot-password", {
      body: JSON.stringify({ email: "alex@example.test" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(await screen.findByText("If that account exists, a reset link has been prepared.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open preview reset link" })).toBeNull();
  });

  test("shows a preview link when the response includes one", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse({
        message: "If that account exists, a reset link has been prepared.",
        previewLink: "/reset-password?token=abc123",
      }),
    );
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/forgot-password", {
      body: JSON.stringify({ email: "alex@example.test" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(await screen.findByText("If that account exists, a reset link has been prepared.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open preview reset link" }).getAttribute("href"),
    ).toBe("/reset-password?token=abc123");
  });
});
