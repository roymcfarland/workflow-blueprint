// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardWorkspace } from "@/components/board-workspace";
import type { BoardSnapshot, SerializedSubtask, SerializedTask } from "@/lib/data";

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

function subtask(overrides: Partial<SerializedSubtask> = {}): SerializedSubtask {
  return {
    id: "subtask-1",
    isComplete: false,
    priority: "LOW",
    sortOrder: 0,
    title: "Draft outline",
    ...overrides,
  };
}

function task(overrides: Partial<SerializedTask> = {}): SerializedTask {
  return {
    archivedAt: null,
    completedAt: null,
    description: null,
    dueDate: null,
    id: "task-active",
    priority: "NONE",
    recurrence: "NONE",
    sortOrder: 0,
    status: "ON_DECK",
    subtasks: [subtask()],
    title: "Visible task",
    ...overrides,
  };
}

function boardSnapshot(nextTask: SerializedTask): BoardSnapshot {
  return {
    description: null,
    iconKey: "briefcase",
    id: "board-test",
    name: "Test Board",
    noteContent: "",
    slug: "test-board",
    tasks: [nextTask],
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
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("BoardWorkspace due date badges", () => {
  test("an overdue active task shows its due date in red", () => {
    render(
      <BoardWorkspace
        board={boardSnapshot(
          task({ status: "IN_PROGRESS", completedAt: null, dueDate: "2020-01-01T00:00:00.000Z" }),
        )}
      />,
    );

    const badge = screen.getByText("Jan 1");
    expect(badge.className).toContain("text-danger");
  });

  test("a completed task does not show its due date in red", () => {
    render(
      <BoardWorkspace
        board={boardSnapshot(
          task({
            status: "DONE",
            completedAt: "2020-01-02T00:00:00.000Z",
            dueDate: "2020-01-01T00:00:00.000Z",
          }),
        )}
      />,
    );

    const badge = screen.getByText("Jan 1");
    expect(badge.className).not.toContain("text-danger");
  });

  test("an active task due within seven days receives the due-soon accent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T18:00:00.000Z"));

    try {
      render(
        <BoardWorkspace
          board={boardSnapshot(
            task({
              completedAt: null,
              dueDate: "2026-08-25T00:00:00.000Z",
              status: "ON_DECK",
            }),
          )}
        />,
      );

      const badge = screen.getByText("Aug 25");
      expect(badge.className).toContain("border-accent");
      expect(badge.className).not.toContain("text-danger");
    } finally {
      vi.useRealTimers();
    }
  });

  test("an active task due beyond seven days does not receive the due-soon accent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T18:00:00.000Z"));

    try {
      render(
        <BoardWorkspace
          board={boardSnapshot(
            task({
              completedAt: null,
              dueDate: "2026-09-01T00:00:00.000Z",
              status: "IN_PROGRESS",
            }),
          )}
        />,
      );

      const badge = screen.getByText("Sep 1");
      expect(badge.className).not.toContain("border-accent");
      expect(badge.className).not.toContain("text-danger");
    } finally {
      vi.useRealTimers();
    }
  });
});
