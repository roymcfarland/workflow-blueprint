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

import { DemoButton } from "@/components/auth/demo-button";

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

function malformedResponse(status = 500) {
  return new Response("<!doctype html><title>502</title>", {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("DemoButton", () => {
  test("starts a demo and redirects to the dashboard", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));

    render(<DemoButton />);
    fireEvent.click(screen.getByRole("button", { name: /view live demo/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/demo");
    expect(init.method).toBe("POST");
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/dashboard"));
  });

  test("shows an error and does not redirect when the demo cannot start", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "Too many requests." }, 429));

    render(<DemoButton />);
    fireEvent.click(screen.getByRole("button", { name: /view live demo/i }));

    await waitFor(() => expect(screen.getByText("Too many requests.")).toBeTruthy());
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  test("shows the fallback message when the demo response omits a message", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({}, 500));

    render(<DemoButton />);
    fireEvent.click(screen.getByRole("button", { name: /view live demo/i }));

    expect(
      await screen.findByText("Unable to start the demo. Please try again."),
    ).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  test("shows the fallback message when the demo response body is malformed", async () => {
    fetchMock.mockResolvedValueOnce(malformedResponse());

    render(<DemoButton />);
    fireEvent.click(screen.getByRole("button", { name: /view live demo/i }));

    expect(
      await screen.findByText("Unable to start the demo. Please try again."),
    ).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
