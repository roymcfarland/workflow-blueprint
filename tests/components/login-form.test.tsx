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

import { LoginForm } from "@/components/auth/login-form";

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

describe("LoginForm", () => {
  test("renders the sign-in controls", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Remember me" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Forgot your password?" }).getAttribute("href")).toBe(
      "/forgot-password",
    );
  });

  test("validates required fields before submitting", async () => {
    const { container } = render(<LoginForm />);

    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("Email is required.")).toBeTruthy();
    expect(screen.getByText("Password is required.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("toggles password visibility", () => {
    render(<LoginForm />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;

    expect(password.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.getAttribute("type")).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.getAttribute("type")).toBe("password");
  });

  test("submits credentials and redirects after a successful sign-in", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-in", {
      body: JSON.stringify({
        email: "alex@example.test",
        password: "password123",
        rememberMe: true,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    await waitFor(expectDashboardNavigation);
  });

  test("shows an API error without navigating", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "Invalid email or password." }, 401));
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email or password.")).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
