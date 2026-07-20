// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardWorkspace } from "@/components/board-workspace";
import type { BoardSnapshot, SerializedSubtask, SerializedTask } from "@/lib/data";

// Deliberately NOT mocking @dnd-kit/core, @dnd-kit/sortable, or @dnd-kit/utilities —
// these tests exercise the subtask panel's real sensors, collision detection, and handlers.

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

function requestJsonBody(init: unknown) {
  if (!init || typeof init !== "object" || !("body" in init)) {
    return null;
  }

  const body = (init as RequestInit).body;
  return typeof body === "string" ? JSON.parse(body) : null;
}

function rect(overrides: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 200,
    height: 50,
    top: 0,
    left: 0,
    right: 200,
    bottom: 50,
    toJSON() {
      return this;
    },
    ...overrides,
  } as DOMRect;
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
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("SubtasksCardPanel remove and reorder", () => {
  test("removes a subtask", async () => {
    const initialTask = task();
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: task({ subtasks: [] }) }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));
    expect(screen.getByDisplayValue("Draft outline")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Remove subtask" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subtasks/subtask-1");
    expect(init.method).toBe("DELETE");
    await waitFor(() => expect(screen.queryByDisplayValue("Draft outline")).toBeNull());
  });

  test("reverts a failed subtask removal and shows an error", async () => {
    const initialTask = task();
    let resolveDelete!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));
    expect(screen.getByDisplayValue("Draft outline")).toBeDefined();
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove subtask" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subtasks/subtask-1");
    expect(init.method).toBe("DELETE");

    // The optimistic removal must be genuinely visible while the request is
    // still in flight — this is what proves the rollback below is a REAL
    // revert, not just "the row was never removed in the first place."
    await waitFor(() => expect(screen.queryByDisplayValue("Draft outline")).toBeNull());

    resolveDelete(apiResponse({ message: "Subtask removal failed." }, 500));

    await waitFor(() => expect(screen.getByDisplayValue("Draft outline")).toBeDefined());
    expect(screen.getByRole("alert").textContent).toBe("Subtask removal failed.");
  });

  test("drags a subtask to reorder it within the panel", async () => {
    const firstSubtask = subtask();
    const secondSubtask = subtask({
      id: "subtask-2",
      priority: "NONE",
      sortOrder: 1,
      title: "Review copy",
    });
    const initialTask = task({ subtasks: [firstSubtask, secondSubtask] });
    const reorderedTask = task({
      subtasks: [
        { ...secondSubtask, sortOrder: 0 },
        { ...firstSubtask, sortOrder: 1 },
      ],
    });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: reorderedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));

    const handles = screen.getAllByRole("button", { name: "Reorder subtask" });
    const firstRow = handles[0].closest(".group") as HTMLElement;
    const secondRow = handles[1].closest(".group") as HTMLElement;
    firstRow.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 0, bottom: 50 }),
    );
    secondRow.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top: 60, bottom: 110 }),
    );
    handles[0].getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: 10, bottom: 30 }),
    );

    fireEvent.mouseDown(handles[0], { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 35 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 55 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 75 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 85 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 85 });
    fireEvent.mouseUp(document, { clientX: 20, clientY: 85, button: 0 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active/subtasks/reorder");
    expect(init.method).toBe("POST");
    expect(requestJsonBody(init)).toEqual({ subtaskIds: ["subtask-2", "subtask-1"] });
  });
});
