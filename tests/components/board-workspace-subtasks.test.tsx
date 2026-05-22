// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function requestJsonBody(init: unknown) {
  if (!init || typeof init !== "object" || !("body" in init)) {
    return null;
  }

  const body = (init as RequestInit).body;
  return typeof body === "string" ? JSON.parse(body) : null;
}

function usedWholeTaskSubtaskPatch(taskId: string) {
  return fetchMock.mock.calls.some(([url, init]) => {
    const request = init as RequestInit | undefined;
    return (
      String(url) === `/api/tasks/${taskId}` &&
      request?.method === "PATCH" &&
      Array.isArray(requestJsonBody(request)?.subtasks)
    );
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
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("BoardWorkspace subtask panel granular API", () => {
  test("toggles and adds subtasks through granular endpoints", async () => {
    const initialTask = task();
    const toggledTask = task({
      subtasks: [subtask({ isComplete: true })],
    });
    const addedTask = task({
      subtasks: [
        subtask({ isComplete: true }),
        subtask({
          id: "subtask-2",
          isComplete: false,
          priority: "NONE",
          sortOrder: 1,
          title: "Review copy",
        }),
      ],
    });

    fetchMock
      .mockResolvedValueOnce(apiResponse({ ok: true, task: toggledTask }))
      .mockResolvedValueOnce(apiResponse({ ok: true, task: addedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));

    expect(screen.getByDisplayValue("Draft outline")).toBeDefined();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [toggleUrl, toggleInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(toggleUrl).toMatch(/^\/api\/subtasks\/subtask-1$/);
    expect(toggleInit.method).toBe("PATCH");
    expect(requestJsonBody(toggleInit)).toEqual({ isComplete: true });
    expect(usedWholeTaskSubtaskPatch(initialTask.id)).toBe(false);

    await waitFor(() => {
      expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    });

    const addInput = screen.getByRole("textbox", { name: "Add subtask" }) as HTMLInputElement;
    addInput.focus();
    fireEvent.change(addInput, { target: { value: "Review copy" } });
    fireEvent.keyDown(addInput, { key: "Enter" });

    expect(addInput.value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(addInput));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [addUrl, addInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(addUrl).toBe(`/api/tasks/${initialTask.id}/subtasks`);
    expect(addInit.method).toBe("POST");
    expect(requestJsonBody(addInit)).toEqual({ priority: "NONE", title: "Review copy" });

    await waitFor(() => expect(screen.getByDisplayValue("Review copy")).toBeDefined());
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(true);
  });

  test("debounces inline title edits through the granular endpoint", async () => {
    vi.useFakeTimers();
    const initialTask = task();
    const renamedTask = task({
      subtasks: [subtask({ title: "Draft outline updated" })],
    });

    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: renamedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));

    const titleInput = screen.getByDisplayValue("Draft outline") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Draft outline updated" } });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [renameUrl, renameInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(renameUrl).toBe("/api/subtasks/subtask-1");
    expect(renameInit.method).toBe("PATCH");
    expect(requestJsonBody(renameInit)).toEqual({ title: "Draft outline updated" });
    expect(usedWholeTaskSubtaskPatch(initialTask.id)).toBe(false);
  });

  test("keeps a focused dirty title while toggling another row", async () => {
    vi.useFakeTimers();
    const initialTask = task({
      subtasks: [
        subtask(),
        subtask({
          id: "subtask-2",
          priority: "NONE",
          sortOrder: 1,
          title: "Check copy",
        }),
      ],
    });
    const titleSavedTask = task({
      subtasks: [
        subtask({ title: "Half-written title" }),
        subtask({
          id: "subtask-2",
          priority: "NONE",
          sortOrder: 1,
          title: "Check copy",
        }),
      ],
    });
    const staleToggleTask = task({
      subtasks: [
        subtask(),
        subtask({
          id: "subtask-2",
          isComplete: true,
          priority: "NONE",
          sortOrder: 1,
          title: "Check copy",
        }),
      ],
    });

    fetchMock
      .mockResolvedValueOnce(apiResponse({ ok: true, task: titleSavedTask }))
      .mockResolvedValueOnce(apiResponse({ ok: true, task: staleToggleTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));

    const firstTitle = screen.getByDisplayValue("Draft outline") as HTMLInputElement;
    fireEvent.focus(firstTitle);
    fireEvent.change(firstTitle, { target: { value: "Half-written title" } });
    fireEvent.blur(firstTitle);

    const secondCheckbox = screen.getAllByRole("checkbox")[1] as HTMLInputElement;
    fireEvent.click(secondCheckbox);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [renameUrl, renameInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(renameUrl).toBe("/api/subtasks/subtask-1");
    expect(renameInit.method).toBe("PATCH");
    expect(requestJsonBody(renameInit)).toEqual({ title: "Half-written title" });

    const [toggleUrl, toggleInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(toggleUrl).toBe("/api/subtasks/subtask-2");
    expect(toggleInit.method).toBe("PATCH");
    expect(requestJsonBody(toggleInit)).toEqual({ isComplete: true });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByDisplayValue("Half-written title")).toBeDefined();
    expect((screen.getAllByRole("checkbox")[1] as HTMLInputElement).checked).toBe(true);
    expect(usedWholeTaskSubtaskPatch(initialTask.id)).toBe(false);
  });
});
