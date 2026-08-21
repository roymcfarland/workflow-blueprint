// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function findListDroppable(headingText: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: headingText });
  const card = heading.closest(".blueprint-surface-flat");
  const droppable = card?.lastElementChild;
  if (!(droppable instanceof HTMLElement)) {
    throw new Error(`Could not find list droppable for ${headingText}`);
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

type FiberNode = {
  memoizedProps: unknown;
  return: FiberNode | null;
};

function findDndHandler(node: HTMLElement, name: "onDragEnd") {
  const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
  if (!fiberKey) {
    throw new Error("Could not find the rendered DnD tree");
  }

  let fiber: FiberNode | null = (node as unknown as Record<string, FiberNode>)[fiberKey];
  while (fiber) {
    const props = fiber.memoizedProps;
    if (
      props &&
      typeof props === "object" &&
      typeof Reflect.get(props, name) === "function" &&
      typeof Reflect.get(props, "onDragStart") === "function" &&
      typeof Reflect.get(props, "onDragOver") === "function"
    ) {
      return Reflect.get(props, name) as (event: {
        active: { id: string };
        over: { id: string } | null;
      }) => Promise<void>;
    }
    fiber = fiber.return;
  }

  throw new Error(`Could not find DnD handler ${name}`);
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

  test("treats an unknown column-like task id as a task rather than a column", async () => {
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", sortOrder: 0 }),
          task({ id: "column:UNKNOWN", title: "Oddly identified task", sortOrder: 1 }),
        ])}
      />,
    );

    const firstHandle = screen.getByRole("button", { name: "Drag First task" });
    const targetHandle = screen.getByRole("button", { name: "Drag Oddly identified task" });
    const firstCard = firstHandle.closest(".relative.isolate") as HTMLElement;
    const targetCard = targetHandle.closest(".relative.isolate") as HTMLElement;
    firstCard.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 50 }),
    );
    targetCard.getBoundingClientRect = vi.fn(() =>
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

    await waitFor(() => expect(reorderPayload()).not.toBeNull());
    expect(reorderPayload()!.items.map((item) => item.taskId)).toEqual([
      "column:UNKNOWN",
      "task-1",
    ]);
  });

  test("dropping a task back on itself takes the same-index no-op", async () => {
    render(<BoardWorkspace board={boardSnapshot([task()])} />);

    const sourceColumn = findColumnDroppable("Up Next");
    sourceColumn.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 400 }),
    );
    const handle = screen.getByRole("button", { name: "Drag First task" });
    const card = handle.closest(".relative.isolate") as HTMLElement;
    card.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 80 }),
    );
    handle.getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: 10, bottom: 30 }),
    );

    fireEvent.mouseDown(handle, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 35, clientY: 35 });
    fireEvent.mouseMove(document, { clientX: 40, clientY: 40 });
    fireEvent.mouseUp(document, { clientX: 40, clientY: 40, button: 0 });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(findColumnDroppable("Up Next").textContent).toContain("First task");
  });

  test("ignores a destination whose runtime id is not a task id", async () => {
    const nonStringDestinationId = { toString: () => "task-2" } as unknown as string;
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", sortOrder: 0 }),
          task({ id: nonStringDestinationId, title: "Second task", sortOrder: 1 }),
        ])}
      />,
    );

    for (const heading of ["Backlog", "Up Next", "In Progress", "Done"]) {
      findColumnDroppable(heading).getBoundingClientRect = vi.fn(() =>
        rect({ left: 0, right: 200, top: -1_000, bottom: -800 }),
      );
    }
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
    await screen.findByText(
      "Draggable item task-1 was moved over droppable area task-2.",
    );
    fireEvent.mouseUp(document, { clientX: 20, clientY: 85, button: 0 });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Drag First task" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Drag Second task" })).toBeDefined();
  });

  test("ignores a drag-end event whose active id is absent from the task list", async () => {
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", sortOrder: 0 }),
          task({ id: "task-2", title: "Second task", sortOrder: 1 }),
        ])}
      />,
    );

    const handle = screen.getByRole("button", { name: "Drag First task" });
    const onDragEnd = findDndHandler(handle, "onDragEnd");

    expect(screen.queryByRole("button", { name: "Drag missing-task" })).toBeNull();
    await act(async () => {
      await onDragEnd({ active: { id: "missing-task" }, over: { id: "task-1" } });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Drag First task" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Drag Second task" })).toBeDefined();
  });

  test("marks empty and populated list destinations while dragging", async () => {
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task", status: "ON_DECK" }),
          task({ id: "task-2", title: "Second task", status: "IN_PROGRESS" }),
        ])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "List" }));

    const source = findListDroppable("Up Next");
    const populated = findListDroppable("In Progress");
    const empty = findListDroppable("Done");
    source.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 200 }),
    );
    populated.getBoundingClientRect = vi.fn(() =>
      rect({ left: 300, right: 500, top: 0, bottom: 200 }),
    );
    empty.getBoundingClientRect = vi.fn(() =>
      rect({ left: 600, right: 800, top: 0, bottom: 200 }),
    );

    const handle = screen.getByRole("button", { name: "Drag First task" });
    const card = handle.closest(".relative.isolate") as HTMLElement;
    const secondCard = screen
      .getByRole("button", { name: "Drag Second task" })
      .closest(".relative.isolate") as HTMLElement;
    card.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 80 }),
    );
    secondCard.getBoundingClientRect = vi.fn(() =>
      rect({ left: 300, right: 500, top: 0, bottom: 80 }),
    );
    handle.getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: 10, bottom: 30 }),
    );

    fireEvent.mouseDown(handle, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 250, clientY: 50 });
    fireEvent.mouseMove(document, { clientX: 450, clientY: 65 });
    fireEvent.mouseMove(document, { clientX: 650, clientY: 80 });
    fireEvent.mouseMove(document, { clientX: 650, clientY: 80 });
    await waitFor(() => expect(empty.className).toContain("outline-brand/35"));
    expect(empty.textContent).toContain("First task");

    fireEvent.mouseMove(document, { clientX: 350, clientY: 150 });
    await waitFor(() => expect(populated.className).toContain("outline-brand/35"));
    fireEvent.mouseUp(document, { clientX: 350, clientY: 150, button: 0 });

    await waitFor(() => expect(reorderPayload()).not.toBeNull());
    expect(populated.textContent).toContain("First task");
    expect(populated.textContent).toContain("Second task");
  });
});
