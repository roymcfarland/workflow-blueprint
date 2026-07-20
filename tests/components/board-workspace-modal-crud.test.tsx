// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    fireEvent.blur(textarea);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-active");
    expect(init.method).toBe("PATCH");
    expect(requestJsonBody(init)?.description).toBe("Ship by Friday.");
  });
});
