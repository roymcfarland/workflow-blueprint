// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardTitleActions } from "@/components/board-title-actions";

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

const board = {
  accentColor: null,
  iconKey: "briefcase",
  name: "Launch Plan",
  slug: "launch-plan",
};

let fetchMock: ReturnType<typeof vi.fn>;

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function openEditDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Edit Launch Plan" }));
}

function openDeleteDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Delete Launch Plan" }));
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

describe("BoardTitleActions", () => {
  test("renders edit and delete buttons without a dialog", () => {
    render(<BoardTitleActions board={board} />);

    expect(screen.getByRole("button", { name: "Edit Launch Plan" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Delete Launch Plan" })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("opens the edit dialog with the current board name", () => {
    render(<BoardTitleActions board={board} />);

    openEditDialog();

    expect(screen.getByRole("dialog", { name: "Edit Launch Plan" })).toBeDefined();
    expect(screen.getByPlaceholderText("Board name").getAttribute("value")).toBe("Launch Plan");
  });

  test("refreshes without pushing when an edit keeps the same slug", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ board: { slug: "launch-plan" }, ok: true }));
    render(<BoardTitleActions board={board} />);

    openEditDialog();
    fireEvent.change(screen.getByPlaceholderText("Board name"), {
      target: { value: "Launch Plan Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/boards/manage/launch-plan");
    expect(request.method).toBe("PATCH");
    expect(request.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(request.body as string)).toEqual({
      iconKey: "briefcase",
      name: "Launch Plan Updated",
    });
    await waitFor(() => expect(navigationMock.refresh).toHaveBeenCalledTimes(1));
    expect(navigationMock.push).not.toHaveBeenCalled();
  });

  test("pushes without refreshing when an edit changes the slug", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ board: { slug: "renamed-plan" }, ok: true }));
    render(<BoardTitleActions board={board} />);

    openEditDialog();
    fireEvent.change(screen.getByPlaceholderText("Board name"), {
      target: { value: "Renamed Plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(navigationMock.push).toHaveBeenCalledWith("/boards/renamed-plan"),
    );
    expect(navigationMock.refresh).not.toHaveBeenCalled();
  });

  test("keeps the edit dialog open and avoids navigation when an edit fails", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse({ message: "A board with that name already exists." }, 409),
    );
    render(<BoardTitleActions board={board} />);

    openEditDialog();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("A board with that name already exists.")).toBeDefined();
    expect(screen.getByRole("dialog", { name: "Edit Launch Plan" })).toBeDefined();
    expect(navigationMock.push).not.toHaveBeenCalled();
    expect(navigationMock.refresh).not.toHaveBeenCalled();
  });

  test("deletes the board, returns to the dashboard, and refreshes", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    render(<BoardTitleActions board={board} />);

    openDeleteDialog();
    expect(screen.getByText("Launch Plan")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Delete Board" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/manage/launch-plan", { method: "DELETE" });
    await waitFor(() => expect(navigationMock.push).toHaveBeenCalledWith("/dashboard"));
    expect(navigationMock.refresh).toHaveBeenCalledTimes(1);
  });

  test("keeps the delete dialog open and avoids navigation when deletion fails", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse({ message: "A board with that name already exists." }, 409),
    );
    render(<BoardTitleActions board={board} />);

    openDeleteDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete Board" }));

    expect(await screen.findByText("A board with that name already exists.")).toBeDefined();
    expect(screen.getByRole("dialog", { name: "Delete Launch Plan" })).toBeDefined();
    expect(navigationMock.push).not.toHaveBeenCalled();
    expect(navigationMock.refresh).not.toHaveBeenCalled();
  });

  test("closes an open dialog when Escape is pressed", () => {
    render(<BoardTitleActions board={board} />);

    openEditDialog();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("keeps dialogs open for inner clicks and closes them from backdrop clicks", () => {
    render(<BoardTitleActions board={board} />);

    openDeleteDialog();
    const dialog = screen.getByRole("dialog", { name: "Delete Launch Plan" });
    fireEvent.click(screen.getByRole("heading", { name: "Delete board" }));

    expect(screen.getByRole("dialog", { name: "Delete Launch Plan" })).toBeDefined();
    fireEvent.click(dialog.parentElement!);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
