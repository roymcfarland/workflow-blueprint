// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function task(overrides: Partial<SerializedTask>): SerializedTask {
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
    subtasks: [],
    title: "Visible task",
    ...overrides,
  };
}

function boardSnapshot(slug = "test-board"): BoardSnapshot {
  return {
    description: null,
    iconKey: "briefcase",
    id: "board-test",
    name: "Test Board",
    noteContent: "",
    slug,
    tasks: [
      task({ id: "task-active", status: "ON_DECK", title: "Visible task" }),
      task({
        archivedAt: "2026-01-01T00:00:00.000Z",
        id: "task-archived",
        status: "ARCHIVED",
        title: "Archived task",
      }),
    ],
  };
}

function renderWorkspace(slug = "test-board") {
  return render(<BoardWorkspace board={boardSnapshot(slug)} />);
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
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("BoardWorkspace archive visibility", () => {
  test("defaults to hiding archived tasks", () => {
    renderWorkspace();

    expect(screen.getByText("Visible task")).toBeDefined();
    expect(screen.queryByText("Archived task")).toBeNull();
  });

  test("reveals archived tasks when toggled to Show", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    expect(screen.getByText("Archived task")).toBeDefined();
  });

  test("persists Show to localStorage", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    expect(localStorage.getItem("wb.board.test-board.archiveMode")).toBe("on");
  });

  test("rehydrates a persisted Show preference", async () => {
    localStorage.setItem("wb.board.test-board.archiveMode", "on");

    renderWorkspace();

    expect(await screen.findByText("Archived task")).toBeDefined();
  });

  test("rehydrates a persisted Hide preference", () => {
    localStorage.setItem("wb.board.test-board.archiveMode", "off");

    renderWorkspace();

    expect(screen.queryByText("Archived task")).toBeNull();
  });

  test("keeps archive preferences scoped per board", () => {
    localStorage.setItem("wb.board.other-board.archiveMode", "on");

    renderWorkspace();

    expect(screen.queryByText("Archived task")).toBeNull();
  });

  test("ignores invalid stored values and leaves them in place", () => {
    localStorage.setItem("wb.board.test-board.archiveMode", "garbage");

    renderWorkspace();

    expect(screen.queryByText("Archived task")).toBeNull();
    expect(localStorage.getItem("wb.board.test-board.archiveMode")).toBe("garbage");
  });
});
