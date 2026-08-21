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

type FiberNode = {
  child: FiberNode | null;
  memoizedProps: unknown;
  return: FiberNode | null;
  sibling: FiberNode | null;
  stateNode?: { current?: FiberNode };
};

function findTaskDetailProps(node: HTMLElement) {
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
      return props as { task: SerializedTask | null | undefined };
    }
    if (current.sibling) stack.push(current.sibling);
    if (current.child) stack.push(current.child);
  }

  throw new Error("Could not find TaskDetailModal props");
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
