// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const boardWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  getBoardSnapshot: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/components/board-workspace", () => ({
  BoardWorkspace: (props: Record<string, unknown>) => {
    boardWorkspaceMock(props);

    return (
      <div
        data-auto-open={String(props.autoOpenNewTask)}
        data-testid="board-workspace"
      />
    );
  },
}));

import BoardPage from "@/app/(app)/boards/[slug]/page";
import { requireCurrentUser } from "@/lib/auth";
import { getBoardSnapshot, type BoardSnapshot } from "@/lib/data";
import { notFound } from "next/navigation";

function board(overrides: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    description: "Launch work",
    iconKey: "rocket",
    id: "board-1",
    name: "Launch Plan",
    noteContent: "",
    slug: "launch-plan",
    tasks: [],
    ...overrides,
  };
}

function pageProps(slug: string, query: { new?: string } = {}) {
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(query),
  };
}

beforeEach(() => {
  boardWorkspaceMock.mockReset();
  vi.mocked(requireCurrentUser).mockReset();
  vi.mocked(getBoardSnapshot).mockReset();
  vi.mocked(notFound).mockClear();
  vi.mocked(requireCurrentUser).mockResolvedValue({ id: "user-1" } as never);
});

afterEach(() => {
  cleanup();
});

describe("BoardPage", () => {
  test("calls notFound when the board does not exist", async () => {
    vi.mocked(getBoardSnapshot).mockResolvedValueOnce(null);

    await expect(BoardPage(pageProps("missing-board"))).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(boardWorkspaceMock).not.toHaveBeenCalled();
  });

  test("renders the fetched board and opens a new task for new=1", async () => {
    const fetchedBoard = board();
    vi.mocked(getBoardSnapshot).mockResolvedValueOnce(fetchedBoard);

    render(await BoardPage(pageProps("launch-plan", { new: "1" })));

    expect(screen.getByTestId("board-workspace").getAttribute("data-auto-open")).toBe("true");
    expect(boardWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ autoOpenNewTask: true, board: fetchedBoard }),
    );
  });

  test("does not auto-open a new task when the query is absent", async () => {
    vi.mocked(getBoardSnapshot).mockResolvedValueOnce(board());

    render(await BoardPage(pageProps("launch-plan")));

    expect(screen.getByTestId("board-workspace").getAttribute("data-auto-open")).toBe("false");
  });

  test("loads the requested slug for the authenticated user", async () => {
    vi.mocked(requireCurrentUser).mockResolvedValueOnce({ id: "authenticated-user" } as never);
    vi.mocked(getBoardSnapshot).mockResolvedValueOnce(board({ slug: "product-roadmap" }));

    render(await BoardPage(pageProps("product-roadmap")));

    expect(requireCurrentUser).toHaveBeenCalledTimes(1);
    expect(getBoardSnapshot).toHaveBeenCalledWith("authenticated-user", "product-roadmap");
  });
});
