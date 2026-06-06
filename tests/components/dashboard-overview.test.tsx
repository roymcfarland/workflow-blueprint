// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DashboardOverview } from "@/components/dashboard-overview";
import type { DashboardSnapshot, DashboardTaskSummary } from "@/lib/data";

const navigationMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: ReactNode; href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: navigationMock.refresh,
  }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

function taskSummary(overrides: Partial<DashboardTaskSummary>): DashboardTaskSummary {
  return {
    boardIconKey: "briefcase",
    boardName: "Launch Plan",
    boardSlug: "launch-plan",
    dueDate: null,
    id: "task-launch",
    priority: "NONE",
    status: "IN_PROGRESS",
    subtasks: [],
    title: "Draft launch checklist",
    ...overrides,
  };
}

function dashboardSnapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  const inProgressTasks =
    overrides.inProgressTasks ?? [
      taskSummary({ id: "task-launch", title: "Draft launch checklist" }),
      taskSummary({
        boardIconKey: "kanban",
        boardName: "Customer Research",
        boardSlug: "customer-research",
        id: "task-retro",
        title: "Interview beta customer",
      }),
    ];

  return {
    activeTaskCount: 3,
    boardBreakdown: [
      {
        iconKey: "briefcase",
        name: "Launch Plan",
        percentage: 67,
        slug: "launch-plan",
        totalTasks: 2,
      },
      {
        iconKey: "kanban",
        name: "Customer Research",
        percentage: 33,
        slug: "customer-research",
        totalTasks: 1,
      },
    ],
    closedLastSevenDays: 1,
    completionRate: 33,
    doneCount: 1,
    inProgressCount: inProgressTasks.length,
    inProgressTasks,
    overdueTasks: [],
    totalTaskCount: 3,
    upcomingTasks: [],
    ...overrides,
  };
}

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("DashboardOverview in-progress panel", () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    navigationMock.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test("renders in-progress tasks without the Boards section", () => {
    render(<DashboardOverview data={dashboardSnapshot()} />);

    expect(screen.getByText("Draft launch checklist")).toBeDefined();
    expect(screen.getByText("Interview beta customer")).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Boards" })).toBeNull();
  });

  test("marks an in-progress task done and removes it from the list", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));

    render(<DashboardOverview data={dashboardSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark Draft launch checklist done" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-launch/done");
    expect(init.method).toBe("POST");
    await waitFor(() => expect(screen.queryByText("Draft launch checklist")).toBeNull());
  });

  test("expands and hides subtasks from the in-progress row caret", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          inProgressTasks: [
            taskSummary({
              subtasks: [
                { id: "subtask-brief", isComplete: false, title: "Draft intro copy" },
                { id: "subtask-review", isComplete: true, title: "Review launch notes" },
              ],
            }),
            taskSummary({
              id: "task-retro",
              title: "Interview beta customer",
            }),
          ],
        })}
      />,
    );

    const showButton = screen.getByRole("button", {
      name: "Show subtasks for Draft launch checklist",
    });

    fireEvent.click(showButton);

    expect(screen.getByText("Draft intro copy")).toBeDefined();
    expect(screen.getByText("Review launch notes")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Hide subtasks for Draft launch checklist" }),
    );

    expect(screen.queryByText("Draft intro copy")).toBeNull();
    expect(screen.queryByText("Review launch notes")).toBeNull();
  });

  test("toggles a subtask via the toggle button optimistically and patches the subtask", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(
      <DashboardOverview
        data={dashboardSnapshot({
          inProgressTasks: [
            taskSummary({
              subtasks: [
                { id: "subtask-brief", isComplete: false, title: "Draft intro copy" },
              ],
            }),
          ],
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show subtasks for Draft launch checklist" }),
    );

    const toggle = screen.getByRole("button", { name: "Mark subtask complete" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Mark subtask incomplete" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subtasks/subtask-brief");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ isComplete: true });

    resolveFetch(apiResponse({ ok: true }));

    await waitFor(() => expect(navigationMock.refresh).toHaveBeenCalledTimes(1));
  });

  test("deletes a subtask via the trash button", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));

    render(
      <DashboardOverview
        data={dashboardSnapshot({
          inProgressTasks: [
            taskSummary({
              subtasks: [
                { id: "subtask-brief", isComplete: false, title: "Draft intro copy" },
              ],
            }),
          ],
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show subtasks for Draft launch checklist" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove subtask" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subtasks/subtask-brief");
    expect(init.method).toBe("DELETE");

    await waitFor(() => expect(navigationMock.refresh).toHaveBeenCalled());
  });

  test("does not render a subtask caret for tasks without subtasks", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          inProgressTasks: [
            taskSummary({
              subtasks: [],
            }),
          ],
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Show subtasks for Draft launch checklist" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Mark Draft launch checklist done" })).toBeDefined();
  });
});
