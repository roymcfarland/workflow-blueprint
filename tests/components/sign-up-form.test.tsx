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

import { SignUpForm } from "@/components/auth/sign-up-form";

let fetchMock: ReturnType<typeof vi.fn>;

const formProps = {
  expiresAt: "2026-08-01T00:00:00.000Z",
  inviteToken: "invite-token-123",
  invitedEmail: "alex@example.test",
};

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

function fillValidRegistrationFields() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alex Example" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "password123" },
  });
}

describe("SignUpForm", () => {
  test("renders invitation details and prefilled account fields", () => {
    render(<SignUpForm {...formProps} />);

    expect(screen.getByText("Invitation for alex@example.test")).toBeTruthy();
    expect(screen.getByText(/This invite expires on/)).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("alex@example.test");
    expect(email.readOnly).toBe(true);
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
  });

  test("toggles each password field independently", () => {
    render(<SignUpForm {...formProps} />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    const confirmation = screen.getByLabelText("Confirm password") as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.getAttribute("type")).toBe("text");
    expect(confirmation.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show confirmation password" }));
    expect(password.getAttribute("type")).toBe("text");
    expect(confirmation.getAttribute("type")).toBe("text");
  });

  test("validates the fields that are not prefilled by the invitation", async () => {
    const { container } = render(<SignUpForm {...formProps} />);

    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("Name is required.")).toBeTruthy();
    expect(screen.getByText("Password is required.")).toBeTruthy();
    expect(screen.getByText("Please confirm the password.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("marks an empty invited email as invalid", async () => {
    const { container } = render(<SignUpForm {...formProps} invitedEmail="" />);

    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("Email is required.")).toBeTruthy();
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("enforces the password minimum length before submitting", async () => {
    const { container } = render(<SignUpForm {...formProps} />);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("submits invitation details and redirects after successful registration", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    render(<SignUpForm {...formProps} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alex Example" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-up", {
      body: JSON.stringify({
        confirmPassword: "password123",
        email: "alex@example.test",
        inviteToken: "invite-token-123",
        name: "Alex Example",
        password: "password123",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    await waitFor(expectDashboardNavigation);
  });

  test("shows an API error without navigating", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "This invitation has expired." }, 400));
    render(<SignUpForm {...formProps} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alex Example" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("This invitation has expired.")).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  test("shows the fallback message when registration fails without a message", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({}, 400));
    render(<SignUpForm {...formProps} />);

    fillValidRegistrationFields();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Unable to create account.")).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
