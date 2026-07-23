// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardWorkspace } from "@/components/board-workspace";
import { ToastProvider } from "@/components/providers/toast-provider";
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
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("BoardWorkspace task detail modal delete", () => {
  test("deleting one task does not leave the delete button disabled for the next task", async () => {
    render(
      <BoardWorkspace
        board={boardSnapshot([
          task({ id: "task-1", title: "First task" }),
          task({ id: "task-2", title: "Second task" }),
        ])}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit task details" })[0]);

    const firstDeleteButton = await screen.findByRole("button", { name: "Delete task" });
    fireEvent.click(firstDeleteButton);

    await waitFor(() => {
      expect(screen.queryByText("First task")).toBeNull();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit task details" })[0]);

    const secondDeleteButton = await screen.findByRole("button", { name: "Delete task" });
    expect((secondDeleteButton as HTMLButtonElement).disabled).toBe(false);
  });

  test("shows a success toast after deleting a task", async () => {
    render(
      <ToastProvider>
        <BoardWorkspace board={boardSnapshot([task()])} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete task" }));

    expect(await screen.findByText("Task deleted.")).toBeDefined();
  });
});
