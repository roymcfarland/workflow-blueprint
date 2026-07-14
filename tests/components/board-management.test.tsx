// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardManagement } from "@/components/board-management";

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMock.push,
    refresh: navigationMock.refresh,
  }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function openCreateForm() {
  fireEvent.click(screen.getByRole("button", { name: "New Board" }));
}

beforeEach(() => {
  fetchMock = vi.fn();
  navigationMock.push.mockReset();
  navigationMock.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("BoardManagement", () => {
  test("renders the New Board button with no form by default", () => {
    render(<BoardManagement />);

    expect(screen.getByRole("button", { name: "New Board" })).toBeDefined();
    expect(screen.queryByPlaceholderText("Board name")).toBeNull();
  });

  test("opens the create form", () => {
    render(<BoardManagement />);

    openCreateForm();

    expect(screen.getByPlaceholderText("Board name")).toBeDefined();
    expect(screen.getByText("New Board")).toBeDefined();
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
  });

  test("closes the form without making a request", () => {
    render(<BoardManagement />);

    openCreateForm();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("button", { name: "New Board" })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("creates a board with the default icon and no accent color", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    render(<BoardManagement />);

    openCreateForm();
    fireEvent.change(screen.getByPlaceholderText("Board name"), {
      target: { value: "Launch Plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/boards/manage");
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(request.body as string)).toEqual({ iconKey: "briefcase", name: "Launch Plan" });
    await waitFor(() => expect(navigationMock.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "New Board" })).toBeDefined();
  });

  test("creates a board with the selected icon and accent color", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    render(<BoardManagement />);

    openCreateForm();
    fireEvent.change(screen.getByPlaceholderText("Board name"), {
      target: { value: "Rocket Launch" },
    });
    fireEvent.click(screen.getByTitle("Rocket"));
    fireEvent.click(screen.getByRole("button", { name: "Accent color #4f78e6" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/boards/manage");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body as string)).toEqual({
      accentColor: "#4f78e6",
      iconKey: "rocket",
      name: "Rocket Launch",
    });
    await waitFor(() => expect(navigationMock.refresh).toHaveBeenCalledTimes(1));
  });

  test("keeps the form open and avoids navigation when creation fails", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse({ message: "A board with that name already exists." }, 409),
    );
    render(<BoardManagement />);

    openCreateForm();
    fireEvent.change(screen.getByPlaceholderText("Board name"), {
      target: { value: "Launch Plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("A board with that name already exists.")).toBeDefined();
    expect(screen.getByPlaceholderText("Board name")).toBeDefined();
    expect(navigationMock.refresh).not.toHaveBeenCalled();
  });
});
