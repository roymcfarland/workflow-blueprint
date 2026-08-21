// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardWorkspace } from "@/components/board-workspace";
import type { BoardSnapshot, SerializedTask } from "@/lib/data";

const dndMockState = vi.hoisted(() => ({ overId: null as string | null }));

vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn(),
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  KeyboardSensor: vi.fn(),
  MouseSensor: vi.fn(),
  pointerWithin: vi.fn(() => []),
  TouchSensor: vi.fn(),
  useDroppable: ({ id }: { id: string }) => ({
    isOver: id === dndMockState.overId,
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
    transition: "transform 200ms",
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

async function renderListWorkspace() {
  localStorage.setItem("wb.board.alpha.viewMode", "list");
  const result = renderWorkspace();
  await flushMicrotasks();
  return result;
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
  dndMockState.overId = null;
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

  test("styles a transiently empty list destination while it is hovered", () => {
    dndMockState.overId = "column:DONE";
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "List" }));

    const doneCard = screen.getByRole("heading", { name: "Done" }).closest(
      ".blueprint-surface-flat",
    );
    const doneBody = doneCard?.lastElementChild;
    expect(doneBody).toBeInstanceOf(HTMLElement);
    expect((doneBody as HTMLElement).className).toContain("bg-brand-soft");
    expect((doneBody as HTMLElement).className).not.toContain("outline-brand/35");
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

  test("removes sortable-card transitions when reduced motion is requested", async () => {
    const defaultRender = renderWorkspace();
    const defaultCard = screen
      .getByRole("button", { name: "Drag Visible task alpha" })
      .closest(".relative.isolate") as HTMLElement;
    expect(defaultCard.style.transition).toBe("transform 200ms");
    defaultRender.unmount();

    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    try {
      renderWorkspace();
      const reducedMotionCard = screen
        .getByRole("button", { name: "Drag Visible task alpha" })
        .closest(".relative.isolate") as HTMLElement;

      await waitFor(() => expect(reducedMotionCard.style.transition).toBe(""));
      expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("BoardWorkspace list-view task row", () => {
  test("opens the task detail modal from the list-row pencil", async () => {
    await renderListWorkspace();
    const dialogName = "Details for Visible task alpha";
    const editButton = screen.getByRole("button", { name: "Edit task details" });

    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();

    fireEvent.mouseDown(editButton);
    fireEvent.click(editButton);

    expect(screen.getByRole("dialog", { name: dialogName })).toBeDefined();
  });

  test("opens the subtasks panel from the list-row toggle", async () => {
    await renderListWorkspace();
    const panelName = "Subtasks for Visible task alpha";
    const openButton = screen.getByRole("button", { name: "Open subtasks menu" });

    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: panelName })).toBeNull();

    fireEvent.mouseDown(openButton);
    fireEvent.click(openButton);

    const closeButton = screen.getByRole("button", { name: "Close subtasks menu" });
    expect(closeButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: panelName })).toBeDefined();
  });

  test("suppresses the default action and event propagation when the drag handle is clicked", async () => {
    await renderListWorkspace();
    const dialogName = "Details for Visible task alpha";
    const panelName = "Subtasks for Visible task alpha";
    const dragButton = screen.getByRole("button", { name: "Drag Visible task alpha" });
    const openButton = screen.getByRole("button", { name: "Open subtasks menu" });

    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
    expect(screen.queryByRole("region", { name: panelName })).toBeNull();

    const documentClickSpy = vi.fn();
    document.addEventListener("click", documentClickSpy);

    try {
      // Returns false only because the handler called preventDefault().
      expect(fireEvent.click(dragButton)).toBe(false);
      // Never reaches document only because the handler called stopPropagation().
      expect(documentClickSpy).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("click", documentClickSpy);
    }

    expect(screen.getByRole("button", { name: "Open subtasks menu" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
    expect(screen.queryByRole("region", { name: panelName })).toBeNull();
  });

  test("removes list-row transitions when reduced motion is requested", async () => {
    const defaultRender = await renderListWorkspace();
    const defaultRow = screen
      .getByRole("button", { name: "Drag Visible task alpha" })
      .closest(".relative.isolate") as HTMLElement;
    expect(defaultRow.style.transition).toBe("transform 200ms");
    defaultRender.unmount();

    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    try {
      await renderListWorkspace();
      const reducedMotionRow = screen
        .getByRole("button", { name: "Drag Visible task alpha" })
        .closest(".relative.isolate") as HTMLElement;

      await waitFor(() => expect(reducedMotionRow.style.transition).toBe(""));
      expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    } finally {
      vi.unstubAllGlobals();
    }
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

  test.each([
    { expected: "Notes are throttled Try again in 7s.", retryAfter: "7" },
    { expected: "Notes are throttled", retryAfter: undefined },
  ])("formats 429 note failures with Retry-After $retryAfter", async ({ expected, retryAfter }) => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (retryAfter) {
      headers.set("Retry-After", retryAfter);
    }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Notes are throttled" }), {
        headers,
        status: 429,
      }),
    );
    renderWorkspace();
    fireEvent.click(getNotesToolbarToggle("Show notes"));

    fireEvent.change(screen.getByPlaceholderText(notesPlaceholder), {
      target: { value: `Rate-limited note ${retryAfter ?? "without retry"}` },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe(expected);
  });

  test("throws a clear error when abort support is unavailable", () => {
    renderWorkspace();
    fireEvent.click(getNotesToolbarToggle("Show notes"));
    vi.stubGlobal("AbortController", undefined);

    try {
      expect(globalThis.AbortController).toBeUndefined();
      expect(() =>
        fireEvent.change(screen.getByPlaceholderText(notesPlaceholder), {
          target: { value: "Cannot create an abort handle" },
        }),
      ).toThrow("Abort support is unavailable.");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
