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

const notesPlaceholder = "Drop links, decisions, and follow-ups here. Saved automatically.";

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

function boardSnapshot(slug = "alpha"): BoardSnapshot {
  return {
    description: null,
    iconKey: "briefcase",
    id: `board-${slug}`,
    name: "Test Board",
    noteContent: "",
    slug,
    tasks: [task({ id: `task-${slug}`, status: "ON_DECK", title: `Visible task ${slug}` })],
  };
}

function renderWorkspace(slug = "alpha") {
  return render(<BoardWorkspace board={boardSnapshot(slug)} />);
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

function expectViewMode(value: "board" | "list") {
  expect(screen.getByRole("button", { name: "Board" }).getAttribute("aria-pressed")).toBe(
    String(value === "board"),
  );
  expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe(
    String(value === "list"),
  );
}

function getNotesToolbarToggle(name: "Show notes" | "Hide notes") {
  return screen.getAllByRole("button", { name })[0];
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
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("BoardWorkspace per-board preferences", () => {
  test("view mode defaults to Board on first render", () => {
    renderWorkspace();

    expectViewMode("board");
  });

  test("view mode rehydrates a persisted List value", async () => {
    localStorage.setItem("wb.board.alpha.viewMode", "list");

    renderWorkspace();
    await flushMicrotasks();

    expectViewMode("list");
  });

  test("view mode toggle persists the selected value", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "List" }));

    expect(localStorage.getItem("wb.board.alpha.viewMode")).toBe("list");
  });

  test("view mode ignores garbage stored values without overwriting them", async () => {
    localStorage.setItem("wb.board.alpha.viewMode", "banana");

    renderWorkspace();
    await flushMicrotasks();

    expectViewMode("board");
    expect(localStorage.getItem("wb.board.alpha.viewMode")).toBe("banana");
  });

  test("notes panel defaults to closed on first render", () => {
    renderWorkspace();

    expect(screen.queryByPlaceholderText(notesPlaceholder)).toBeNull();
  });

  test("notes panel rehydrates a persisted open state", async () => {
    localStorage.setItem("wb.board.alpha.notesOpen", "true");

    renderWorkspace();
    await flushMicrotasks();

    expect(screen.getByPlaceholderText(notesPlaceholder)).toBeDefined();
  });

  test("notes toggle persists open and closed states", () => {
    renderWorkspace();

    fireEvent.click(getNotesToolbarToggle("Show notes"));
    expect(localStorage.getItem("wb.board.alpha.notesOpen")).toBe("true");

    fireEvent.click(getNotesToolbarToggle("Hide notes"));
    expect(localStorage.getItem("wb.board.alpha.notesOpen")).toBe("false");
  });

  test("notes panel close button persists the closed state and unmounts the panel", async () => {
    localStorage.setItem("wb.board.alpha.notesOpen", "true");

    renderWorkspace();
    await flushMicrotasks();

    const closeButtons = screen.getAllByRole("button", { name: "Hide notes" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(localStorage.getItem("wb.board.alpha.notesOpen")).toBe("false");
    expect(screen.queryByPlaceholderText(notesPlaceholder)).toBeNull();
  });

  test("view and notes preferences are isolated per board", () => {
    const alpha = renderWorkspace("alpha");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(getNotesToolbarToggle("Show notes"));
    alpha.unmount();

    renderWorkspace("beta");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    fireEvent.click(getNotesToolbarToggle("Show notes"));
    fireEvent.click(getNotesToolbarToggle("Hide notes"));

    expect(localStorage.getItem("wb.board.alpha.viewMode")).toBe("list");
    expect(localStorage.getItem("wb.board.alpha.notesOpen")).toBe("true");
    expect(localStorage.getItem("wb.board.beta.viewMode")).toBe("board");
    expect(localStorage.getItem("wb.board.beta.notesOpen")).toBe("false");
  });

  test("rehydrating non-default preferences does not emit hydration warnings", async () => {
    localStorage.setItem("wb.board.alpha.viewMode", "list");
    localStorage.setItem("wb.board.alpha.notesOpen", "true");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWorkspace();
    await flushMicrotasks();

    const hydrationWarnings = consoleError.mock.calls.filter((call) =>
      call.some(
        (part) =>
          typeof part === "string" &&
          (part.includes("hydration") || part.includes("did not match")),
      ),
    );
    expect(hydrationWarnings).toHaveLength(0);
  });
});

describe("BoardWorkspace note autosave", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("saves after the debounce and returns the indicator to idle", async () => {
    renderWorkspace();
    fireEvent.click(getNotesToolbarToggle("Show notes"));

    fireEvent.change(screen.getByPlaceholderText(notesPlaceholder), {
      target: { value: "A decision worth saving" },
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/alpha/note",
      expect.objectContaining({
        body: JSON.stringify({ content: "A decision worth saving" }),
        method: "PATCH",
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("Saved");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  test("collapses rapid edits into one save with the latest content", async () => {
    renderWorkspace();
    fireEvent.click(getNotesToolbarToggle("Show notes"));
    const textarea = screen.getByPlaceholderText(notesPlaceholder);

    fireEvent.change(textarea, { target: { value: "First draft" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.change(textarea, { target: { value: "Latest draft" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/alpha/note",
      expect.objectContaining({
        body: JSON.stringify({ content: "Latest draft" }),
        method: "PATCH",
      }),
    );
  });

  test("shows the server message when saving fails", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Notes are temporarily unavailable" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }),
    );
    renderWorkspace();
    fireEvent.click(getNotesToolbarToggle("Show notes"));

    fireEvent.change(screen.getByPlaceholderText(notesPlaceholder), {
      target: { value: "This save will fail" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.getByRole("status").textContent).toContain(
      "Notes are temporarily unavailable",
    );
  });
});
