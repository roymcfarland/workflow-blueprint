// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardWorkspace } from "@/components/board-workspace";
import { ToastProvider } from "@/components/providers/toast-provider";
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

function positionSubtaskRows(handles: HTMLElement[]) {
  handles.forEach((handle, index) => {
    const top = index * 60;
    const row = handle.closest(".group") as HTMLElement;
    row.getBoundingClientRect = vi.fn(() =>
      rect({ left: 0, right: 200, top, bottom: top + 50 }),
    );
    handle.getBoundingClientRect = vi.fn(() =>
      rect({ left: 10, right: 30, top: top + 10, bottom: top + 30 }),
    );
  });
}

async function dragSubtask(handle: HTMLElement, startY: number, endY: number) {
  vi.useFakeTimers();
  try {
    fireEvent.mouseDown(handle, { button: 0, clientX: 20, clientY: startY });
    for (const clientY of [startY + 15, (startY + endY) / 2, endY]) {
      fireEvent.mouseMove(document, { clientX: 20, clientY });
    }
    fireEvent.mouseUp(document, { button: 0, clientX: 20, clientY: endY });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
  } finally {
    vi.useRealTimers();
  }
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

  test("shows a success toast after removing a subtask", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: task({ subtasks: [] }) }));

    render(
      <ToastProvider>
        <BoardWorkspace board={boardSnapshot(task())} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove subtask" }));

    expect(await screen.findByText("Subtask removed.")).toBeDefined();
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

  test("does not duplicate a removed row restored by a concurrent server reconcile", async () => {
    const secondSubtask = subtask({
      id: "subtask-2",
      priority: "NONE",
      sortOrder: 1,
      title: "Check copy",
    });
    const initialTask = task({ subtasks: [subtask(), secondSubtask] });
    const reconciledTask = task({
      subtasks: [subtask(), { ...secondSubtask, isComplete: true }],
    });
    let resolveDelete!: (response: Response) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveDelete = resolve;
          }),
      )
      .mockResolvedValueOnce(apiResponse({ ok: true, task: reconciledTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));

    const removedRow = screen.getByDisplayValue("Draft outline").closest(".group") as HTMLElement;
    fireEvent.click(within(removedRow).getByRole("button", { name: "Remove subtask" }));
    await waitFor(() => expect(screen.queryByDisplayValue("Draft outline")).toBeNull());

    const siblingRow = screen.getByDisplayValue("Check copy").closest(".group") as HTMLElement;
    fireEvent.click(within(siblingRow).getByRole("button", { name: "Mark subtask complete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByDisplayValue("Draft outline")).toHaveLength(1));

    resolveDelete(apiResponse({ message: "Subtask removal failed." }, 500));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Subtask removal failed."));
    expect(screen.getAllByDisplayValue("Draft outline")).toHaveLength(1);
    expect(
      within(siblingRow).getByRole("button", { name: "Mark subtask incomplete" }),
    ).toBeDefined();
  });

  test("subtask rows don't carry a competing CSS transition alongside dnd-kit's own", async () => {
    const initialTask = task();

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));

    const row = (await screen.findByDisplayValue("Draft outline")).closest(".group");
    expect(row).not.toBeNull();
    expect(row?.className.split(/\s+/)).not.toContain("transition");
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
    await act(async () => {
      await Promise.resolve();
    });

    const handles = screen.getAllByRole("button", { name: "Reorder subtask" });
    positionSubtaskRows(handles);
    await dragSubtask(handles[0], 20, 85);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active/subtasks/reorder");
    expect(init.method).toBe("POST");
    expect(requestJsonBody(init)).toEqual({ subtaskIds: ["subtask-2", "subtask-1"] });
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("textbox", { name: "Subtask title" })
          .map((input) => (input as HTMLTextAreaElement).value),
      ).toEqual(["Review copy", "Draft outline"]),
    );
  });

  test("does not reorder while a different subtask mutation is in flight", async () => {
    const secondSubtask = subtask({
      id: "subtask-2",
      priority: "NONE",
      sortOrder: 1,
      title: "Review copy",
    });
    const patchTask = task({
      subtasks: [subtask({ isComplete: true }), secondSubtask],
    });
    let resolvePatch!: (response: Response) => void;
    const patchRequest = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    fetchMock.mockReturnValueOnce(patchRequest);

    render(
      <BoardWorkspace board={boardSnapshot(task({ subtasks: [subtask(), secondSubtask] }))} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Mark subtask complete" })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const handles = screen.getAllByRole("button", { name: "Reorder subtask" });
    expect((handles[0] as HTMLButtonElement).disabled).toBe(true);
    expect((handles[1] as HTMLButtonElement).disabled).toBe(false);
    positionSubtaskRows(handles);
    await dragSubtask(handles[1], 80, 20);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getAllByRole("textbox", { name: "Subtask title" })
        .map((input) => (input as HTMLTextAreaElement).value),
    ).toEqual(["Draft outline", "Review copy"]);

    await act(async () => {
      resolvePatch(apiResponse({ ok: true, task: patchTask }));
      await patchRequest;
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mark subtask incomplete" })).toBeDefined(),
    );
  });

  test("shields a pending-created subtask from editing and reordering", async () => {
    const createRequest = Promise.withResolvers<Response>();
    const createdTask = task({
      subtasks: [
        subtask(),
        subtask({
          id: "subtask-2",
          priority: "NONE",
          sortOrder: 1,
          title: "Pending create",
        }),
      ],
    });
    fetchMock.mockReturnValueOnce(createRequest.promise);

    render(<BoardWorkspace board={boardSnapshot(task())} />);
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));
    await act(async () => {
      await Promise.resolve();
    });

    const addInput = screen.getByRole("textbox", { name: "Add subtask" }) as HTMLInputElement;
    expect(addInput.disabled).toBe(false);
    fireEvent.change(addInput, { target: { value: "Pending create" } });
    fireEvent.keyDown(addInput, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const pendingTitle = screen.getByDisplayValue("Pending create") as HTMLTextAreaElement;
    const pendingRow = pendingTitle.closest(".group") as HTMLElement;
    const pendingHandle = within(pendingRow).getByRole("button", {
      name: "Reorder subtask",
    }) as HTMLButtonElement;
    expect(pendingTitle.disabled).toBe(true);
    expect(pendingHandle.disabled).toBe(true);
    expect(
      (within(pendingRow).getByRole("button", {
        name: "Mark subtask complete",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (within(pendingRow).getByRole("button", {
        name: "Remove subtask",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    const existingRow = screen.getByDisplayValue("Draft outline").closest(".group") as HTMLElement;
    const existingHandle = within(existingRow).getByRole("button", {
      name: "Reorder subtask",
    }) as HTMLButtonElement;
    expect(existingHandle.disabled).toBe(false);
    const handles = screen.getAllByRole("button", { name: "Reorder subtask" });
    positionSubtaskRows(handles);
    await dragSubtask(existingHandle, 20, 85);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getAllByRole("textbox", { name: "Subtask title" })
        .map((input) => (input as HTMLTextAreaElement).value),
    ).toEqual(["Draft outline", "Pending create"]);

    await act(async () => {
      createRequest.resolve(apiResponse({ ok: true, task: createdTask }));
      await createRequest.promise;
    });
    await waitFor(() =>
      expect((screen.getByDisplayValue("Pending create") as HTMLTextAreaElement).disabled).toBe(
        false,
      ),
    );
  });

  test("does not reorder when the active subtask vanishes during a concurrent reconcile", async () => {
    const secondSubtask = subtask({
      id: "subtask-2",
      priority: "NONE",
      sortOrder: 1,
      title: "Review copy",
    });
    const siblingRequest = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(siblingRequest.promise);

    render(
      <BoardWorkspace board={boardSnapshot(task({ subtasks: [subtask(), secondSubtask] }))} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));
    await act(async () => {
      await Promise.resolve();
    });

    const rows = screen.getAllByRole("textbox", { name: "Subtask title" });
    const firstRow = rows[0].closest(".group") as HTMLElement;
    const secondRow = rows[1].closest(".group") as HTMLElement;
    fireEvent.click(within(secondRow).getByRole("button", { name: "Mark subtask complete" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const handles = screen.getAllByRole("button", { name: "Reorder subtask" });
    expect((handles[0] as HTMLButtonElement).disabled).toBe(false);
    expect((handles[1] as HTMLButtonElement).disabled).toBe(true);
    positionSubtaskRows(handles);
    fireEvent.mouseDown(handles[0], { button: 0, clientX: 20, clientY: 20 });
    for (const clientY of [35, 55, 75, 85]) {
      fireEvent.mouseMove(document, { clientX: 20, clientY });
    }

    await act(async () => {
      siblingRequest.resolve(
        apiResponse({
          ok: true,
          task: task({ subtasks: [{ ...secondSubtask, isComplete: true }] }),
        }),
      );
      await siblingRequest.promise;
    });
    await waitFor(() => expect(screen.queryByDisplayValue("Draft outline")).toBeNull());
    expect(
      (screen.getByRole("button", { name: "Reorder subtask" }) as HTMLButtonElement).disabled,
    ).toBe(false);

    vi.useFakeTimers();
    try {
      fireEvent.mouseUp(document, { button: 0, clientX: 20, clientY: 85 });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(firstRow.isConnected).toBe(false);
    expect(screen.getByDisplayValue("Review copy")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("does not reorder a subtask dropped onto itself", async () => {
    const secondSubtask = subtask({
      id: "subtask-2",
      priority: "NONE",
      sortOrder: 1,
      title: "Review copy",
    });

    render(
      <BoardWorkspace board={boardSnapshot(task({ subtasks: [subtask(), secondSubtask] }))} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));
    await act(async () => {
      await Promise.resolve();
    });

    const handles = screen.getAllByRole("button", { name: "Reorder subtask" });
    positionSubtaskRows(handles);
    await dragSubtask(handles[0], 20, 35);

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("textbox", { name: "Subtask title" })
        .map((input) => (input as HTMLTextAreaElement).value),
    ).toEqual(["Draft outline", "Review copy"]);
  });

  test("restores the previous subtask order when reordering fails", async () => {
    const secondSubtask = subtask({
      id: "subtask-2",
      priority: "NONE",
      sortOrder: 1,
      title: "Review copy",
    });
    let resolveReorder!: (response: Response) => void;
    const reorderRequest = new Promise<Response>((resolve) => {
      resolveReorder = resolve;
    });
    fetchMock.mockReturnValueOnce(reorderRequest);

    render(
      <BoardWorkspace board={boardSnapshot(task({ subtasks: [subtask(), secondSubtask] }))} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open subtasks menu" }));
    await act(async () => {
      await Promise.resolve();
    });

    const handles = screen.getAllByRole("button", { name: "Reorder subtask" });
    positionSubtaskRows(handles);
    await dragSubtask(handles[0], 20, 85);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("textbox", { name: "Subtask title" })
          .map((input) => (input as HTMLTextAreaElement).value),
      ).toEqual(["Review copy", "Draft outline"]),
    );

    await act(async () => {
      resolveReorder(apiResponse({ message: "Subtask reorder failed." }, 500));
      await reorderRequest;
    });

    await waitFor(() =>
      expect(
        screen
          .getAllByRole("textbox", { name: "Subtask title" })
          .map((input) => (input as HTMLTextAreaElement).value),
      ).toEqual(["Draft outline", "Review copy"]),
    );
    expect(screen.getByRole("alert").textContent).toBe("Subtask reorder failed.");
  });
});
