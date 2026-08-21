// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  routerMock.push.mockClear();
  routerMock.refresh.mockClear();
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

function expectDashboardNavigation() {
  expect(routerMock.push).toHaveBeenCalledExactlyOnceWith("/dashboard");
  expect(routerMock.refresh).toHaveBeenCalledOnce();
  expect(routerMock.push.mock.invocationCallOrder[0]).toBeLessThan(
    routerMock.refresh.mock.invocationCallOrder[0],
  );
}

describe("ResetPasswordForm", () => {
  test("renders password fields and preserves the reset token", () => {
    const { container } = render(<ResetPasswordForm token="reset-token-abc" />);

    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set new password" })).toBeTruthy();
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"]')?.value).toBe(
      "reset-token-abc",
    );
  });

  test("validates both password fields before submitting", async () => {
    const { container } = render(<ResetPasswordForm token="reset-token-abc" />);

    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("Password is required.")).toBeTruthy();
    expect(screen.getByText("Please confirm the password.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("toggles each password field independently", () => {
    render(<ResetPasswordForm token="reset-token-abc" />);
    const password = screen.getByLabelText("New password") as HTMLInputElement;
    const confirmation = screen.getByLabelText("Confirm password") as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.getAttribute("type")).toBe("text");
    expect(confirmation.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show confirmation password" }));
    expect(password.getAttribute("type")).toBe("text");
    expect(confirmation.getAttribute("type")).toBe("text");
  });

  test("submits the token and passwords before redirecting after success", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    render(<ResetPasswordForm token="reset-token-abc" />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/reset-password", {
      body: JSON.stringify({
        token: "reset-token-abc",
        password: "password123",
        confirmPassword: "password123",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    await waitFor(expectDashboardNavigation);
  });

  test("shows an API error without navigating", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "This reset link has expired." }, 400));
    render(<ResetPasswordForm token="reset-token-abc" />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByText("This reset link has expired.")).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  test("shows the fallback message when resetting fails without a message", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({}, 400));
    render(<ResetPasswordForm token="reset-token-abc" />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByText("Unable to reset the password.")).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
