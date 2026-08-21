// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
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
    subtasks: [],
    title: "Visible task",
    ...overrides,
  };
}

function taskWithAttachment(): SerializedTask {
  return task({
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
}

function boardSnapshot(nextTask: SerializedTask | SerializedTask[]): BoardSnapshot {
  return {
    description: null,
    iconKey: "briefcase",
    id: "board-test",
    name: "Test Board",
    noteContent: "",
    slug: "test-board",
    tasks: Array.isArray(nextTask) ? nextTask : [nextTask],
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function openTaskDetails(index = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: "Edit task details" })[index]);
  return screen.getByRole("dialog");
}

type HookNode = {
  memoizedState: unknown;
  next: HookNode | null;
};

type FiberNode = {
  child: FiberNode | null;
  memoizedProps: unknown;
  memoizedState?: HookNode | null;
  return: FiberNode | null;
  sibling: FiberNode | null;
  stateNode?: { current?: FiberNode };
};

function findTaskDetailFiber(node: HTMLElement) {
  const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
  if (!fiberKey) {
    throw new Error("Could not find the rendered BoardWorkspace tree");
  }

  let fiber = (node as unknown as Record<string, FiberNode>)[fiberKey];
  while (fiber.return) {
    fiber = fiber.return;
  }

  const stack = [fiber.stateNode?.current ?? fiber];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const props = current.memoizedProps;
    if (
      props &&
      typeof props === "object" &&
      "task" in props &&
      typeof Reflect.get(props, "onDelete") === "function" &&
      typeof Reflect.get(props, "onSave") === "function" &&
      typeof Reflect.get(props, "onTaskUpdated") === "function"
    ) {
      return current;
    }
    if (current.sibling) stack.push(current.sibling);
    if (current.child) stack.push(current.child);
  }

  throw new Error("Could not find TaskDetailModal props");
}

function findTaskDetailProps(node: HTMLElement) {
  return findTaskDetailFiber(node).memoizedProps as {
    task: SerializedTask | null | undefined;
  };
}

function findTaskDetailRefs(node: HTMLElement) {
  const refs: Array<{ current: unknown }> = [];
  let hook = findTaskDetailFiber(node).memoizedState ?? null;
  while (hook) {
    const state = hook.memoizedState;
    if (state && typeof state === "object" && Object.hasOwn(state, "current")) {
      refs.push(state as { current: unknown });
    }
    hook = hook.next;
  }
  return refs;
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

describe("TaskDetailModal remaining CRUD", () => {
  test("seeds both undated and dated tasks when the modal opens", async () => {
    const undatedRender = render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();

    const undatedInput = screen.getByLabelText("Due date") as HTMLInputElement;
    await waitFor(() => expect(undatedInput.value).toBe(""));
    undatedRender.unmount();

    render(
      <BoardWorkspace
        board={boardSnapshot(task({ dueDate: "2026-08-20T00:00:00.000Z" }))}
      />,
    );
    openTaskDetails();

    const datedInput = screen.getByLabelText("Due date") as HTMLInputElement;
    await waitFor(() => expect(datedInput.value).toBe("2026-08-20"));
  });

  test("discards a closed task's queued seed before opening another task", () => {
    const queuedMicrotasks: VoidFunction[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      queuedMicrotasks.push(callback);
    });
    const flushQueuedMicrotasks = () => {
      while (queuedMicrotasks.length > 0) {
        const callbacks = queuedMicrotasks.splice(0);
        act(() => callbacks.forEach((callback) => callback()));
      }
    };
    const firstTask = task({ id: "task-first", title: "First task" });
    const secondTask = task({ id: "task-second", sortOrder: 1, title: "Second task" });
    render(<BoardWorkspace board={boardSnapshot([firstTask, secondTask])} />);

    openTaskDetails(0);
    expect(screen.getByRole("dialog", { name: "Details for First task" })).toBeDefined();
    expect(queuedMicrotasks.length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Details for First task" })).toBeNull();
    flushQueuedMicrotasks();

    openTaskDetails(1);
    const titleInput = screen.getByLabelText("Task title") as HTMLInputElement;
    expect(titleInput.value).toBe("");
    expect(queuedMicrotasks.length).toBeGreaterThan(0);

    flushQueuedMicrotasks();
    expect(titleInput.value).toBe("Second task");
  });

  test("shows exact Error and non-Error save failures", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ message: "Task update rejected." }, 500))
      .mockRejectedValueOnce("network down");
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();

    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText("Task priority"), { target: { value: "HIGH" } });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Task update rejected."),
    );

    fireEvent.change(screen.getByLabelText("Task recurrence"), {
      target: { value: "DAILY" },
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unable to save."));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not save an unchanged modal title on blur", async () => {
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();
    const titleInput = screen.getByLabelText("Task title") as HTMLInputElement;
    await waitFor(() => expect(titleInput.value).toBe("Visible task"));

    fireEvent.blur(titleInput);

    expect(titleInput.value).toBe("Visible task");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("saves a changed modal title and blurs the input on Enter", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse({ ok: true, task: task({ title: "Entered modal title" }) }),
    );
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();
    const titleInput = screen.getByLabelText("Task title") as HTMLInputElement;
    await waitFor(() => expect(titleInput.value).toBe("Visible task"));
    titleInput.focus();
    expect(fireEvent.keyDown(titleInput, { key: "ArrowLeft" })).toBe(true);
    expect(document.activeElement).toBe(titleInput);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(titleInput, { target: { value: "Entered modal title" } });
    expect(fetchMock).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(titleInput, { key: "Enter" })).toBe(false);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.title).toBe("Entered modal title");
    expect(document.activeElement).not.toBe(titleInput);
  });

  test("clears an existing due date with a null patch", async () => {
    const initialTask = task({ dueDate: "2026-08-20T00:00:00.000Z" });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: task() }));
    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    openTaskDetails();
    const dueDateInput = screen.getByLabelText("Due date") as HTMLInputElement;
    await waitFor(() => expect(dueDateInput.value).toBe("2026-08-20"));

    fireEvent.change(dueDateInput, { target: { value: "" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.dueDate).toBeNull();
    expect(dueDateInput.value).toBe("");
  });

  test("focuses and clears an existing description on blur", async () => {
    const initialTask = task({ description: "Existing detail" });
    fetchMock.mockResolvedValueOnce(
      apiResponse({ ok: true, task: task({ description: null }) }),
    );
    const { container } = render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    openTaskDetails();
    const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("Existing detail"));
    const workspace = container.firstElementChild as HTMLElement;
    const descriptionFocusedRef = findTaskDetailRefs(workspace).find(
      (ref) => typeof ref.current === "boolean",
    );
    expect(descriptionFocusedRef?.current).toBe(false);
    textarea.focus();
    expect(document.activeElement).toBe(textarea);
    expect(descriptionFocusedRef?.current).toBe(true);

    fireEvent.change(textarea, { target: { value: "" } });
    expect(fetchMock).not.toHaveBeenCalled();
    textarea.blur();
    expect(descriptionFocusedRef?.current).toBe(false);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestJsonBody(init)?.description).toBeNull();
    expect(textarea.value).toBe("");
  });

  test("does not save an unchanged modal description on blur", async () => {
    render(<BoardWorkspace board={boardSnapshot(task({ description: "Existing detail" }))} />);
    openTaskDetails();
    const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("Existing detail"));

    fireEvent.blur(textarea);

    expect(textarea.value).toBe("Existing detail");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("opens the attachment picker and ignores a change with no file", () => {
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();
    const uploadInput = screen.getByLabelText("Upload attachment") as HTMLInputElement;
    const inputClick = vi.spyOn(uploadInput, "click").mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));
    expect(inputClick).toHaveBeenCalledOnce();

    fireEvent.change(uploadInput, { target: { files: [] } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("uploads an untyped attachment as application/octet-stream", async () => {
    const uploadUrlRequest = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(uploadUrlRequest.promise)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        apiResponse({
          ok: true,
          task: task({
            attachments: [
              {
                contentType: "",
                createdAt: "2026-08-21T00:00:00.000Z",
                fileName: "note.txt",
                id: "att-note",
                size: 1,
              },
            ],
          }),
        }),
      );
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();
    const uploadInput = screen.getByLabelText("Upload attachment");
    const addButton = screen.getByRole("button", { name: "Add attachment" });
    expect((addButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(uploadInput, {
      target: { files: [new File(["x"], "note.txt", { type: "" })] },
    });
    expect((screen.getByRole("button", { name: "Uploading…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await act(async () => {
      uploadUrlRequest.resolve(
        apiResponse({ path: "tasks/task-active/note.txt", uploadUrl: "https://upload.example" }),
      );
      await uploadUrlRequest.promise;
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(uploadUrl).toBe("https://upload.example");
    expect(uploadInit.method).toBe("PUT");
    expect(uploadInit.headers).toEqual({ "Content-Type": "application/octet-stream" });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Add attachment" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });

  test("finishes an attachment upload after Escape closes the modal", async () => {
    const uploadUrlRequest = deferred<Response>();
    const updatedTask = task({
      attachments: [
        {
          contentType: "text/plain",
          createdAt: "2026-08-21T00:00:00.000Z",
          fileName: "late.txt",
          id: "att-late",
          size: 4,
        },
      ],
    });
    fetchMock
      .mockReturnValueOnce(uploadUrlRequest.promise)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));
    const { container } = render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();
    const workspace = container.firstElementChild as HTMLElement;
    const fileInputRef = findTaskDetailRefs(workspace).find(
      (ref) => ref.current instanceof HTMLInputElement,
    );
    expect(fileInputRef?.current).toBe(screen.getByLabelText("Upload attachment"));

    fireEvent.change(screen.getByLabelText("Upload attachment"), {
      target: { files: [new File(["late"], "late.txt", { type: "text/plain" })] },
    });
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDefined();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fileInputRef?.current).toBeNull();

    await act(async () => {
      uploadUrlRequest.resolve(
        apiResponse({ path: "tasks/task-active/late.txt", uploadUrl: "https://upload.example" }),
      );
      await uploadUrlRequest.promise;
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("dialog")).toBeNull();

    openTaskDetails();
    await waitFor(() => expect(screen.getByRole("button", { name: "late.txt" })).toBeDefined());
  });

  test("shows the exact fallback for a non-Error attachment upload failure", async () => {
    fetchMock.mockRejectedValueOnce("network down");
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(screen.getByLabelText("Upload attachment"), {
      target: { files: [new File(["x"], "note.txt", { type: "text/plain" })] },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to upload the attachment."),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Add attachment" })).toBeDefined();
  });

  test("shows the exact fallback for a non-Error attachment download failure", async () => {
    fetchMock.mockRejectedValueOnce("network down");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<BoardWorkspace board={boardSnapshot(taskWithAttachment())} />);
    openTaskDetails();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "spec.pdf" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to download the attachment."),
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  test("shows the exact fallback for a non-Error attachment removal failure", async () => {
    fetchMock.mockRejectedValueOnce("network down");
    render(<BoardWorkspace board={boardSnapshot(taskWithAttachment())} />);
    openTaskDetails();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove attachment spec.pdf" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to remove the attachment."),
    );
    expect(screen.getByRole("button", { name: "spec.pdf" })).toBeDefined();
    expect(
      (screen.getByRole("button", {
        name: "Remove attachment spec.pdf",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  test("shows the exact fallback for a non-Error task deletion failure", async () => {
    fetchMock.mockRejectedValueOnce("network down");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    openTaskDetails();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Unable to delete task."),
    );
    expect(screen.getByRole("dialog", { name: "Details for Visible task" })).toBeDefined();
    expect((screen.getByRole("button", { name: "Delete task" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  test("normalizes a deleted open task to null before the modal closes", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const realSetTimeout = globalThis.setTimeout;
    let workspace: HTMLElement | null = null;
    let detailTaskDuringDelete: SerializedTask | null | undefined;
    let forceWorkspaceRender: () => void = () => {
      throw new Error("Workspace render harness is not ready");
    };

    function WorkspaceHarness() {
      const [, setVersion] = useState(0);
      forceWorkspaceRender = () => setVersion((version) => version + 1);
      return <BoardWorkspace board={boardSnapshot(task())} />;
    }

    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) => {
      if (delay === 1800 && workspace) {
        flushSync(forceWorkspaceRender);
        detailTaskDuringDelete = findTaskDetailProps(workspace).task;
      }
      return realSetTimeout(callback, delay, ...args);
    });
    const { container } = render(<WorkspaceHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    workspace = container.firstElementChild as HTMLElement;

    expect(findTaskDetailProps(workspace).task?.id).toBe("task-active");
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Details for Visible task" })).toBeNull(),
    );
    expect(detailTaskDuringDelete).toBeNull();
  });

  test("removes a label", async () => {
    const initialTask = task({
      labels: [{ id: "label-1", text: "Urgent", color: "#ef4444", sortOrder: 0 }],
    });
    const updatedTask = task({ labels: [] });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove label Urgent" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/labels/label-1");
    expect(init.method).toBe("DELETE");

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove label Urgent" })).toBeNull(),
    );
  });

  test("toggles a checklist item complete", async () => {
    const initialTask = task({
      checklist: [{ id: "check-1", text: "Verify copy", isComplete: false, sortOrder: 0 }],
    });
    const updatedTask = task({
      checklist: [{ id: "check-1", text: "Verify copy", isComplete: true, sortOrder: 0 }],
    });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark checklist item complete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/checklist/check-1");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)).toEqual({ isComplete: true });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark checklist item incomplete" }),
      ).toBeDefined(),
    );
  });

  test("removes a checklist item", async () => {
    const initialTask = task({
      checklist: [{ id: "check-1", text: "Verify copy", isComplete: false, sortOrder: 0 }],
    });
    const updatedTask = task({ checklist: [] });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove checklist item Verify copy" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/checklist/check-1");
    expect(init.method).toBe("DELETE");

    await waitFor(() => expect(screen.queryByText("Verify copy")).toBeNull());
  });

  test("downloads an attachment by opening its signed URL", async () => {
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
    fetchMock.mockResolvedValueOnce(
      apiResponse({ ok: true, url: "https://signed.example/download", fileName: "spec.pdf" }),
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "spec.pdf" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("/api/attachments/att-1");
    expect(init?.method ?? "GET").toBe("GET");

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        "https://signed.example/download",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });

  test("formats attachment sizes in bytes, kilobytes, and megabytes", () => {
    const attachments = [
      { fileName: "bytes.txt", id: "att-bytes", size: 512 },
      { fileName: "kilobytes.txt", id: "att-kilobytes", size: 2048 },
      { fileName: "megabytes.txt", id: "att-megabytes", size: 5_000_000 },
    ].map(({ fileName, id, size }) => ({
      contentType: "text/plain",
      createdAt: "2026-01-01T00:00:00.000Z",
      fileName,
      id,
      size,
    }));

    render(<BoardWorkspace board={boardSnapshot(task({ attachments }))} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));

    expect(screen.getByText("512 B")).toBeDefined();
    expect(screen.getByText("2 KB")).toBeDefined();
    expect(screen.getByText("4.8 MB")).toBeDefined();
  });

  test("removes an attachment", async () => {
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
    const updatedTask = task({ attachments: [] });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove attachment spec.pdf" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/attachments/att-1");
    expect(init.method).toBe("DELETE");

    await waitFor(() => expect(screen.queryByText("spec.pdf")).toBeNull());
  });

  test("editing the due date in the detail modal patches the task immediately", async () => {
    const initialTask = task();
    const updatedTask = task({ dueDate: "2026-08-01" });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-08-01" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.dueDate).toBe("2026-08-01");
  });

  test("editing the description in the detail modal patches the task on blur", async () => {
    const initialTask = task({ description: null });
    const updatedTask = task({ description: "Ship by Friday." });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(initialTask)} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task details" }));
    const textarea = screen.getByLabelText("Description");
    fireEvent.change(textarea, { target: { value: "Ship by Friday." } });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.blur(textarea);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.description).toBe("Ship by Friday.");
  });
});

describe("TaskPreview card controls", () => {
  test("stops pointer events from bubbling from card action controls", () => {
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    const editButton = screen.getByRole("button", { name: "Edit task details" });
    const subtasksButton = screen.getByRole("button", { name: "Open subtasks menu" });
    const dragButton = screen.getByRole("button", { name: "Drag Visible task" });
    const mouseDownListener = vi.fn();
    const clickListener = vi.fn();
    document.addEventListener("mousedown", mouseDownListener);
    document.addEventListener("click", clickListener);

    try {
      fireEvent.mouseDown(editButton);
      fireEvent.mouseDown(subtasksButton);
      expect(mouseDownListener).not.toHaveBeenCalled();

      expect(fireEvent.click(dragButton)).toBe(false);
      expect(clickListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("mousedown", mouseDownListener);
      document.removeEventListener("click", clickListener);
    }
  });
});

describe("EditableTaskTitle inline rename", () => {
  test("enters edit mode with the current title focused", () => {
    render(<BoardWorkspace board={boardSnapshot(task())} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));

    const input = screen.getByLabelText("Task title for Visible task");
    expect((input as HTMLInputElement).value).toBe("Visible task");
    expect(document.activeElement).toBe(input);
  });

  test("saves a changed title on blur", async () => {
    const updatedTask = task({ title: "Renamed task" });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(task())} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));
    const input = screen.getByLabelText("Task title for Visible task");
    fireEvent.change(input, { target: { value: "Renamed task" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.title).toBe("Renamed task");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rename Renamed task" })).toBeDefined(),
    );
  });

  test("saves a changed title on Enter", async () => {
    const updatedTask = task({ title: "Entered title" });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot(task())} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));
    const input = screen.getByLabelText("Task title for Visible task");
    fireEvent.change(input, { target: { value: "Entered title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.title).toBe("Entered title");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rename Entered title" })).toBeDefined(),
    );
  });

  test("renames a dated task without replacing its sibling", async () => {
    const initialTask = task({ dueDate: "2026-08-20T00:00:00.000Z" });
    const siblingTask = task({
      id: "task-sibling",
      sortOrder: 1,
      title: "Sibling task",
    });
    const updatedTask = task({
      dueDate: "2026-08-20T00:00:00.000Z",
      title: "Dated task renamed",
    });
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true, task: updatedTask }));

    render(<BoardWorkspace board={boardSnapshot([initialTask, siblingTask])} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));
    const input = screen.getByLabelText("Task title for Visible task");
    fireEvent.change(input, { target: { value: "Dated task renamed" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestJsonBody(init)?.dueDate).toBe("2026-08-20");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rename Dated task renamed" })).toBeDefined(),
    );
    expect(screen.getByRole("button", { name: "Rename Sibling task" })).toBeDefined();
  });

  test("rejects an empty title and stays in edit mode", () => {
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));
    const input = screen.getByLabelText("Task title for Visible task");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Task title is required.")).toBeDefined();
    expect(screen.getByLabelText("Task title for Visible task")).toBeDefined();
  });

  test("closes edit mode without saving an unchanged title", () => {
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));

    fireEvent.blur(screen.getByLabelText("Task title for Visible task"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rename Visible task" })).toBeDefined();
  });

  test("cancels an edited title on Escape without saving", () => {
    render(<BoardWorkspace board={boardSnapshot(task())} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));
    const input = screen.getByLabelText("Task title for Visible task");
    fireEvent.change(input, { target: { value: "Unsaved title" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(fetchMock).not.toHaveBeenCalled();
    const renameButton = screen.getByRole("button", { name: "Rename Visible task" });
    expect(renameButton.textContent).toBe("Visible task");
  });

  test("shows a rename failure and stays in edit mode", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ message: "Rename blocked." }, 500));

    render(<BoardWorkspace board={boardSnapshot(task())} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));
    const input = screen.getByLabelText("Task title for Visible task");
    fireEvent.change(input, { target: { value: "Rejected title" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText("Rename blocked.")).toBeDefined());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Task title for Visible task")).toBeDefined();
  });

  test("ignores a second save action while an inline rename is pending", async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValueOnce(request.promise);

    render(<BoardWorkspace board={boardSnapshot(task())} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Visible task" }));
    const input = screen.getByLabelText("Task title for Visible task") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Pending title" } });
    fireEvent.blur(input);

    await waitFor(() => expect(input.disabled).toBe(true));
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.blur(input);
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => {
      request.resolve(apiResponse({ ok: true, task: task({ title: "Pending title" }) }));
      await request.promise;
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rename Pending title" })).toBeDefined(),
    );
  });
});
