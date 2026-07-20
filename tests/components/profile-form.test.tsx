// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { ProfileForm } from "@/components/profile-form";

let fetchMock: ReturnType<typeof vi.fn>;

function renderForm() {
  return render(
    <ProfileForm user={{ email: "alex@example.test", name: "Alex Test", themePreference: "day" }} />,
  );
}

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

beforeEach(() => {
  routerMock.push.mockClear();
  routerMock.refresh.mockClear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProfileForm", () => {
  test("renders the current name and email", () => {
    renderForm();

    expect(screen.getByDisplayValue("Alex Test")).toBeDefined();
    expect(screen.getByDisplayValue("alex@example.test")).toBeDefined();
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(3);
  });

  test("submits and shows a saved status", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/profile");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("Alex Test");
    expect(body.email).toBe("alex@example.test");

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Saved"));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  test("shows an error message and does not refresh on a failed save", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "Current password is incorrect." }, 400));
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Current password is incorrect."),
    );
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  test("selecting a different theme includes it in the submitted payload", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.themePreference).toBe("night");
  });

  test("reverts the saved status back to idle after a delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toContain("Saved"));

    await act(() => vi.advanceTimersByTimeAsync(1800));

    expect(screen.queryByRole("status")).toBeNull();
  });
});
