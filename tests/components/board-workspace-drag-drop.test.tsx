// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardWorkspace } from "@/components/board-workspace";
import type { BoardSnapshot, SerializedTask } from "@/lib/data";

// Deliberately NOT mocking @dnd-kit/core, @dnd-kit/sortable, or @dnd-kit/utilities —
// every other board-workspace test file does, but this file exists specifically to
// drive the real sensors, real collision detection, and real handlers.

let fetchMock: ReturnType<typeof vi.fn>;

function task(overrides: Partial<SerializedTask> = {}): SerializedTask {
  return {
    archivedAt: null,
    completedAt: null,
    description: null,
    dueDate: null,
    id: "task-1",
    priority: "NONE",
    recurrence: "NONE",
    sortOrder: 0,
    status: "ON_DECK",
    subtasks: [],
    title: "First task",
    ...overrides,
  };
}

function boardSnapshot(tasks: SerializedTask[]): BoardSnapshot {
  return {
    description: null,
    iconKey: "briefcase",
    id: "board-test",
    name: "Test Board",
    noteContent: "",
    slug: "test-board",
    tasks,
  };
}

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function rect(overrides: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 200,
    height: 400,
    top: 0,
    left: 0,
    right: 200,
    bottom: 400,
    toJSON() {
      return this;
    },
    ...overrides,
  } as DOMRect;
}

function findColumnDroppable(headingText: string): HTMLElement {
  const heading = screen.getByText(headingText);
  const columnWrapper = heading.closest(".blueprint-surface-flat") as HTMLElement | null;
  if (!columnWrapper) {
    throw new Error(`Could not find column wrapper for ${headingText}`);
  }

  const droppable = columnWrapper.querySelector(".blueprint-scrollbar") as HTMLElement | null;
  if (!droppable) {
    throw new Error(`Could not find droppable for ${headingText}`);
  }

  return droppable;
}

function reorderPayload() {
  const call = fetchMock.mock.calls.find((candidate) => candidate[0] === "/api/tasks/reorder");
  if (!call) {
    return null;
  }

  return JSON.parse((call[1] as RequestInit).body as string) as {
    items: Array<{ taskId: string; status: string; sortOrder: number }>;
  };
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
    writable: true,
  });
  fetchMock = vi.fn().mockResolvedValue(apiResponse({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("BoardWorkspace drag and drop", () => {
  test("dragging a card into a different column persists the new status", async () => {
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", status: "ON_DECK", sortOrder: 0 }),
          task({ id: "task-2", title: "Second task", status: "IN_PROGRESS", sortOrder: 0 }),
        ])}
      />,
    );

    const sourceColumn = findColumnDroppable("Up Next");
    const targetColumn = findColumnDroppable("In Progress");
    sourceColumn.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 400 }),
    );
    targetColumn.getBoundingClientRect = vi.fn(() =>
      rect({ left: 300, right: 500, top: 0, bottom: 400 }),
    );

    const handle = screen.getByRole("button", { name: "Drag First task" });
    handle.getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: 10, bottom: 30 }),
    );

    fireEvent.mouseDown(handle, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 40 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 300, clientY: 80 });
    fireEvent.mouseMove(document, { clientX: 350, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 350, clientY: 100 });
    fireEvent.mouseUp(document, { clientX: 350, clientY: 100, button: 0 });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const payload = reorderPayload();
    expect(
      payload,
      `fetch calls: ${JSON.stringify(fetchMock.mock.calls.map((call) => call[0]))}`,
    ).toBeTruthy();
    expect(payload!.items).toContainEqual(
      expect.objectContaining({ taskId: "task-1", status: "IN_PROGRESS" }),
    );
  });

  test("dragging a card within its own column persists the new sortOrder", async () => {
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", status: "ON_DECK", sortOrder: 0 }),
          task({ id: "task-2", title: "Second task", status: "ON_DECK", sortOrder: 1 }),
        ])}
      />,
    );

    const firstHandle = screen.getByRole("button", { name: "Drag First task" });
    const secondHandle = screen.getByRole("button", { name: "Drag Second task" });
    const firstCard = firstHandle.closest(".relative.isolate") as HTMLElement;
    const secondCard = secondHandle.closest(".relative.isolate") as HTMLElement;

    firstCard.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 50 }),
    );
    secondCard.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 60, bottom: 110 }),
    );
    firstHandle.getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: 10, bottom: 30 }),
    );

    fireEvent.mouseDown(firstHandle, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 35 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 55 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 75 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 85 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 85 });
    fireEvent.mouseUp(document, { clientX: 20, clientY: 85, button: 0 });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const payload = reorderPayload();
    expect(
      payload,
      `fetch calls: ${JSON.stringify(fetchMock.mock.calls.map((call) => call[0]))}`,
    ).toBeTruthy();
    const task1Item = payload!.items.find((item) => item.taskId === "task-1")!;
    const task2Item = payload!.items.find((item) => item.taskId === "task-2")!;
    expect(task1Item.status).toBe("ON_DECK");
    expect(task2Item.status).toBe("ON_DECK");
    expect(task1Item.sortOrder).toBeGreaterThan(task2Item.sortOrder);
  });

  test("a failed persist reverts the optimistic move and shows an error", async () => {
    fetchMock.mockResolvedValue(apiResponse({ message: "Server exploded" }, 500));

    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", status: "ON_DECK", sortOrder: 0 }),
          task({ id: "task-2", title: "Second task", status: "IN_PROGRESS", sortOrder: 0 }),
        ])}
      />,
    );

    const sourceColumn = findColumnDroppable("Up Next");
    const targetColumn = findColumnDroppable("In Progress");
    sourceColumn.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 400 }),
    );
    targetColumn.getBoundingClientRect = vi.fn(() =>
      rect({ left: 300, right: 500, top: 0, bottom: 400 }),
    );

    const handle = screen.getByRole("button", { name: "Drag First task" });
    handle.getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: 10, bottom: 30 }),
    );

    fireEvent.mouseDown(handle, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 40 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 300, clientY: 80 });
    fireEvent.mouseMove(document, { clientX: 350, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 350, clientY: 100 });
    fireEvent.mouseUp(document, { clientX: 350, clientY: 100, button: 0 });

    const errorMessage = await screen.findByText("Server exploded");
    expect(errorMessage.closest('[role="status"]')).not.toBeNull();

    const sourceColumnAfter = findColumnDroppable("Up Next");
    expect(sourceColumnAfter.textContent).toContain("First task");
  });

  test("dropping in the same position does not persist", async () => {
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", status: "ON_DECK", sortOrder: 0 }),
          task({ id: "task-2", title: "Second task", status: "IN_PROGRESS", sortOrder: 0 }),
        ])}
      />,
    );

    const sourceColumn = findColumnDroppable("Up Next");
    sourceColumn.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 400 }),
    );

    const handle = screen.getByRole("button", { name: "Drag First task" });
    handle.getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: 10, bottom: 30 }),
    );

    fireEvent.mouseDown(handle, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 40, clientY: 20 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(document, { clientX: 20, clientY: 20, button: 0 });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(findColumnDroppable("Up Next").textContent).toContain("First task");
  });

  test("pressing Escape mid-drag cancels the move and leaves the task in its original column", async () => {
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", status: "ON_DECK", sortOrder: 0 }),
          task({ id: "task-2", title: "Second task", status: "IN_PROGRESS", sortOrder: 0 }),
        ])}
      />,
    );

    const sourceColumn = findColumnDroppable("Up Next");
    const targetColumn = findColumnDroppable("In Progress");
    sourceColumn.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 400 }),
    );
    targetColumn.getBoundingClientRect = vi.fn(() =>
      rect({ left: 300, right: 500, top: 0, bottom: 400 }),
    );

    const handle = screen.getByRole("button", { name: "Drag First task" });
    handle.getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: 10, bottom: 30 }),
    );

    fireEvent.mouseDown(handle, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 350, clientY: 100 });
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    fireEvent.mouseUp(document, { clientX: 350, clientY: 100, button: 0 });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock.mock.calls.find((call) => call[0] === "/api/tasks/reorder")).toBeUndefined();
    expect(findColumnDroppable("Up Next").textContent).toContain("First task");
  });
});
