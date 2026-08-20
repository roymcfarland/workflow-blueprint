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

function selectAttachmentForUpload() {
  const file = new File(["pdf-bytes"], "spec.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Upload attachment"), {
    target: { files: [file] },
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
    expect(
      screen.getByRole("button", { name: "Mark subtask complete" }).getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Mark subtask complete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [toggleUrl, toggleInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(toggleUrl).toMatch(/^\/api\/subtasks\/subtask-1$/);
    expect(toggleInit.method).toBe("PATCH");
    expect(requestJsonBody(toggleInit)).toEqual({ isComplete: true });
    expect(usedWholeTaskSubtaskPatch(initialTask.id)).toBe(false);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Mark subtask incomplete" }).getAttribute("aria-pressed"),
      ).toBe("true");
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
    expect(
      screen.getByRole("button", { name: "Mark subtask incomplete" }).getAttribute("aria-pressed"),
    ).toBe("true");
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

    const secondToggle = screen.getAllByRole("button", { name: "Mark subtask complete" })[1];
    fireEvent.click(secondToggle);

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
    expect(
      screen.getByRole("button", { name: "Mark subtask incomplete" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(usedWholeTaskSubtaskPatch(initialTask.id)).toBe(false);
  });

  test("editing priority in the detail modal patches the task", async () => {
    const initialTask = task();
    const updatedTask = task({ priority: "URGENT" });

    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Task priority" }), {
      target: { value: "URGENT" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.priority).toBe("URGENT");

    // The server response is applied asynchronously, and the task renders in both
    // the card and the open detail modal. Await the re-render so PriorityBadge's
    // non-NONE branch is exercised deterministically rather than racing teardown.
    expect((await screen.findAllByText("Urgent")).length).toBeGreaterThan(0);
  });

  test("editing recurrence in the detail modal patches the task", async () => {
    const initialTask = task();
    const updatedTask = task({ recurrence: "WEEKLY" });

    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Task recurrence" }), {
      target: { value: "WEEKLY" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.recurrence).toBe("WEEKLY");
  });

  test("editing the title in the detail modal patches the task", async () => {
    const initialTask = task({ title: "Original title" });
    const updatedTask = task({ title: "Renamed in modal" });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    const input = screen.getByRole("textbox", { name: "Task title" });
    fireEvent.change(input, { target: { value: "Renamed in modal" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url) === `/api/tasks/${initialTask.id}` &&
            (init as RequestInit)?.method === "PATCH",
        ),
      ).toBe(true),
    );
    const patch = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === `/api/tasks/${initialTask.id}` &&
        (init as RequestInit)?.method === "PATCH",
    );
    expect(requestJsonBody(patch![1])?.title).toBe("Renamed in modal");
  });

  test("an empty title in the detail modal is not saved", async () => {
    const initialTask = task({ title: "Keep me" });

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    const input = screen.getByRole("textbox", { name: "Task title" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === `/api/tasks/${initialTask.id}` &&
          (init as RequestInit)?.method === "PATCH",
      ),
    ).toBe(false);
  });

  test("adds a label in the detail modal", async () => {
    const initialTask = task();
    const updatedTask = task({
      labels: [{ id: "label-1", text: "Urgent", color: "#ef4444", sortOrder: 0 }],
    });

    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New label text" }), {
      target: { value: "Urgent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/tasks/${initialTask.id}/labels`);
    expect(init.method).toBe("POST");
    expect(requestJsonBody(init)?.text).toBe("Urgent");

    await waitFor(() => expect(screen.getAllByText("Urgent").length).toBeGreaterThan(0));
  });

  test("shows an error when adding a label fails", async () => {
    const initialTask = task();
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "That label already exists." }, 409));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    const input = screen.getByRole("textbox", { name: "New label text" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Urgent" } });
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("That label already exists."),
    );
    expect(input.value).toBe("Urgent");
  });

  test("shows an error and keeps the label when removing it fails", async () => {
    const initialTask = task({
      labels: [{ id: "label-1", text: "Urgent", color: "#ef4444", sortOrder: 0 }],
    });
    fetchMock.mockResolvedValueOnce(apiResponse({}, 500));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove label Urgent" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to remove label."),
    );
    expect(screen.getByRole("button", { name: "Remove label Urgent" })).toBeDefined();
  });

  test("adds a checklist item in the detail modal", async () => {
    const initialTask = task();
    const updatedTask = task({
      checklist: [{ id: "check-1", text: "Verify copy", isComplete: false, sortOrder: 0 }],
    });

    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New checklist item" }), {
      target: { value: "Verify copy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add checklist item" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/tasks/${initialTask.id}/checklist`);
    expect(init.method).toBe("POST");
    expect(requestJsonBody(init)?.text).toBe("Verify copy");

    await waitFor(() => expect(screen.getByText("Verify copy")).toBeDefined());
  });

  test("shows an error when adding a checklist item fails", async () => {
    const initialTask = task();
    fetchMock.mockResolvedValueOnce(
      apiResponse({ message: "Checklist items are temporarily unavailable." }, 503),
    );

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    const input = screen.getByRole("textbox", {
      name: "New checklist item",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Verify copy" } });
    fireEvent.click(screen.getByRole("button", { name: "Add checklist item" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Checklist items are temporarily unavailable.",
      ),
    );
    expect(input.value).toBe("Verify copy");
  });

  test("shows an error and keeps a checklist item incomplete when toggling fails", async () => {
    const initialTask = task({
      checklist: [{ id: "check-1", text: "Verify copy", isComplete: false, sortOrder: 0 }],
    });
    fetchMock.mockResolvedValueOnce(
      apiResponse({ message: "Checklist update was rejected." }, 409),
    );

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark checklist item complete" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Checklist update was rejected."),
    );
    expect(
      screen
        .getByRole("button", { name: "Mark checklist item complete" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  test("shows an error and keeps the checklist item when removing it fails", async () => {
    const initialTask = task({
      checklist: [{ id: "check-1", text: "Verify copy", isComplete: false, sortOrder: 0 }],
    });
    fetchMock.mockResolvedValueOnce(apiResponse({}, 500));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove checklist item Verify copy" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to remove checklist item."),
    );
    expect(
      screen.getByRole("button", { name: "Remove checklist item Verify copy" }),
    ).toBeDefined();
    expect(screen.getByText("Verify copy")).toBeDefined();
  });

  test("uploads an attachment in the detail modal", async () => {
    const initialTask = task();
    const updatedTask = task({
      attachments: [
        {
          contentType: "application/pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          fileName: "spec.pdf",
          id: "att-1",
          size: 2048,
        },
      ],
    });

    fetchMock
      .mockResolvedValueOnce(
        apiResponse({
          ok: true,
          path: "tasks/task-active/abc",
          token: "tok",
          uploadUrl: "https://signed.example/upload",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));

    const file = new File(["pdf-bytes"], "spec.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText("Upload attachment") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const [urlUrl, urlInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(urlUrl).toBe(`/api/tasks/${initialTask.id}/attachments/upload-url`);
    expect(requestJsonBody(urlInit)?.fileName).toBe("spec.pdf");

    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(putUrl).toBe("https://signed.example/upload");
    expect(putInit.method).toBe("PUT");

    const [recordUrl, recordInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(recordUrl).toBe(`/api/tasks/${initialTask.id}/attachments`);
    expect(requestJsonBody(recordInit)?.storagePath).toBe("tasks/task-active/abc");

    await waitFor(() => expect(screen.getByText("spec.pdf")).toBeDefined());
  });

  test("stops when starting an attachment upload fails", async () => {
    const initialTask = task();
    fetchMock.mockResolvedValueOnce(apiResponse({}, 500));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    selectAttachmentForUpload();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to start the upload."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("stops when the attachment upload response is malformed", async () => {
    const initialTask = task();
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    selectAttachmentForUpload();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to start the upload."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("stops when uploading an attachment to storage fails", async () => {
    const initialTask = task();
    fetchMock
      .mockResolvedValueOnce(
        apiResponse({
          ok: true,
          path: "tasks/task-active/abc",
          uploadUrl: "https://signed.example/upload",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    selectAttachmentForUpload();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("The file upload failed."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("shows an error when saving an uploaded attachment fails", async () => {
    const initialTask = task();
    fetchMock
      .mockResolvedValueOnce(
        apiResponse({
          ok: true,
          path: "tasks/task-active/abc",
          uploadUrl: "https://signed.example/upload",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(apiResponse({}, 500));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    selectAttachmentForUpload();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to save the attachment."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("does not open an attachment when its download fails", async () => {
    const initialTask = task({
      attachments: [
        {
          contentType: "application/pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          fileName: "spec.pdf",
          id: "att-1",
          size: 2048,
        },
      ],
    });
    fetchMock.mockResolvedValueOnce(apiResponse({}, 500));
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "spec.pdf" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to download the attachment."),
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  test("shows an error and keeps the attachment when removing it fails", async () => {
    const initialTask = task({
      attachments: [
        {
          contentType: "application/pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          fileName: "spec.pdf",
          id: "att-1",
          size: 2048,
        },
      ],
    });
    fetchMock.mockResolvedValueOnce(apiResponse({}, 500));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove attachment spec.pdf" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to remove the attachment."),
    );
    expect(screen.getByRole("button", { name: "spec.pdf" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove attachment spec.pdf" })).toBeDefined();
  });

  test("keeps the task detail modal open when deletion is cancelled", () => {
    const initialTask = task();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));

    expect(confirmSpy).toHaveBeenCalledWith("Delete this task?");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Details for Visible task" })).toBeDefined();
  });

  test("shows an error and keeps the task detail modal open when deletion fails", async () => {
    const initialTask = task();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(apiResponse({}, 500));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to delete task."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/tasks/${initialTask.id}`);
    expect(init.method).toBe("DELETE");
    expect(screen.getByRole("dialog", { name: "Details for Visible task" })).toBeDefined();
  });
});
