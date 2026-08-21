// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardWorkspace } from "@/components/board-workspace";
import type { BoardSnapshot, SerializedTask } from "@/lib/data";

vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn(),
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  KeyboardSensor: vi.fn(),
  MouseSensor: vi.fn(),
  pointerWithin: vi.fn(() => []),
  TouchSensor: vi.fn(),
  useDroppable: () => ({
    isOver: false,
    setNodeRef: vi.fn(),
  }),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: <T,>(items: T[], fromIndex: number, toIndex: number) => {
    const nextItems = [...items];
    const [movedItem] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, movedItem);
    return nextItems;
  },
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setActivatorNodeRef: vi.fn(),
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

let fetchMock: ReturnType<typeof vi.fn>;

function emptyBoard(): BoardSnapshot {
  return {
    description: null,
    iconKey: "briefcase",
    id: "board-test",
    name: "Test Board",
    noteContent: "",
    slug: "test-board",
    tasks: [],
  };
}

function createdTask(): SerializedTask {
  return {
    archivedAt: null,
    completedAt: null,
    description: null,
    dueDate: null,
    id: "task-new",
    priority: "NONE",
    recurrence: "NONE",
    sortOrder: 0,
    status: "ON_DECK",
    subtasks: [],
    title: "Write spec",
  };
}

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function requestJsonBody(init: unknown) {
  if (!init || typeof init !== "object" || !("body" in init)) {
    return null;
  }
  const body = (init as RequestInit).body;
  return typeof body === "string" ? JSON.parse(body) : null;
}

function openQuickAddComposer() {
  render(<BoardWorkspace board={emptyBoard()} />);
  fireEvent.click(screen.getByRole("button", { name: "Add task to Up Next" }));
  return screen.getByRole("textbox", { name: "Add task to Up Next" });
}

describe("BoardWorkspace quick-add", () => {
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
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  test("opens the default composer on first paint when autoOpenNewTask is enabled", () => {
    const defaultRender = render(<BoardWorkspace board={emptyBoard()} />);
    expect(screen.queryByRole("textbox", { name: "Add task to Up Next" })).toBeNull();
    defaultRender.unmount();

    render(<BoardWorkspace autoOpenNewTask board={emptyBoard()} />);

    expect(screen.getByRole("textbox", { name: "Add task to Up Next" })).toBeDefined();
  });

  test("opens the default composer from the header New task button", () => {
    render(<BoardWorkspace board={emptyBoard()} />);
    const newTaskButtons = screen.getAllByRole("button", { name: "New task" });

    expect(newTaskButtons).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: "Add task to Up Next" })).toBeNull();

    fireEvent.click(newTaskButtons[0]);

    expect(screen.getByRole("textbox", { name: "Add task to Up Next" })).toBeDefined();
  });

  test("opens the default composer from the empty-state New task button", () => {
    render(<BoardWorkspace board={emptyBoard()} />);
    const newTaskButtons = screen.getAllByRole("button", { name: "New task" });

    expect(newTaskButtons).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: "Add task to Up Next" })).toBeNull();

    fireEvent.click(newTaskButtons[1]);

    expect(screen.getByRole("textbox", { name: "Add task to Up Next" })).toBeDefined();
  });

  test("opens and closes the list-view quick-add composer", () => {
    render(<BoardWorkspace board={emptyBoard()} />);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    const addButton = screen.getByRole("button", { name: "Add task to Up Next" });

    expect(screen.queryByRole("textbox", { name: "Add task to Up Next" })).toBeNull();
    fireEvent.click(addButton);

    const input = screen.getByRole("textbox", { name: "Add task to Up Next" });
    expect(input).toBeDefined();
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Add task to Up Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add task to Up Next" })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("creates a task via quick-add through the board endpoint", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: createdTask() }));

      render(<BoardWorkspace board={emptyBoard()} />);

      fireEvent.click(screen.getByRole("button", { name: "Add task to Up Next" }));

      const input = screen.getByRole("textbox", { name: "Add task to Up Next" });
      fireEvent.change(input, { target: { value: "Write spec" } });
      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/boards/test-board/tasks");
      expect(init.method).toBe("POST");
      expect(requestJsonBody(init)).toEqual({
        title: "Write spec",
        description: null,
        status: "ON_DECK",
        dueDate: null,
        priority: "NONE",
        recurrence: "NONE",
        subtasks: [],
      });
      expect(screen.getByRole("status").textContent).toBe("Task created");
      expect(screen.getByRole("button", { name: "Add task to Up Next" })).toBeTruthy();
      expect(screen.queryByRole("textbox", { name: "Add task to Up Next" })).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1800);
      });

      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps the composer open when Enter is pressed with an empty title", () => {
    const input = openQuickAddComposer();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Add task to Up Next" })).toBe(input);
  });

  test("closes the composer without creating when Escape is pressed", () => {
    const input = openQuickAddComposer();
    fireEvent.change(input, { target: { value: "Draft task" } });
    expect((input as HTMLInputElement).value).toBe("Draft task");

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Add task to Up Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add task to Up Next" })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("closes the composer when an empty input blurs", () => {
    const input = openQuickAddComposer();

    fireEvent.blur(input);

    expect(screen.queryByRole("textbox", { name: "Add task to Up Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add task to Up Next" })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("keeps the composer open when an input with text blurs", () => {
    const input = openQuickAddComposer();
    fireEvent.change(input, { target: { value: "Keep drafting" } });
    expect((input as HTMLInputElement).value).toBe("Keep drafting");

    fireEvent.blur(input);

    expect(screen.getByRole("textbox", { name: "Add task to Up Next" })).toBe(input);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows the server message and keeps the composer open when create fails", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValueOnce(apiResponse({ message: "Board is locked" }, 500));
      const input = openQuickAddComposer();
      fireEvent.change(input, { target: { value: "Blocked task" } });

      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText(/Board is locked/)).toBeDefined();
      expect(screen.getByRole("textbox", { name: "Add task to Up Next" })).toBe(input);
      expect((input as HTMLInputElement).disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("shows the generic message for a non-Error create rejection", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValueOnce("network down");
      const input = openQuickAddComposer();
      fireEvent.change(input, { target: { value: "Offline task" } });

      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText("Unable to create task.")).toBeDefined();
      expect(screen.getByRole("textbox", { name: "Add task to Up Next" })).toBe(input);
    } finally {
      vi.useRealTimers();
    }
  });
});
