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
    boardAccentColor: null,
    boardIconKey: "briefcase",
    boardName: "Launch Plan",
    boardSlug: "launch-plan",
    completedAt: null,
    dueDate: null,
    id: "task-launch",
    priority: "NONE",
    status: "IN_PROGRESS",
    subtasks: [],
    title: "Draft launch checklist",
    updatedAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
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
    activeTokens: [],
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
    boardHealth: [],
    closedLastSevenDays: 1,
    completionRate: 33,
    doneCount: 1,
    inProgressCount: inProgressTasks.length,
    inProgressTasks,
    overdueTasks: [],
    recentlyCompletedTasks: [],
    staleTasks: [],
    onDeckTasks: [],
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

type DashboardSubtaskSummary = DashboardTaskSummary["subtasks"][number];

function renderExpandedSubtasks(subtasks: DashboardSubtaskSummary[]) {
  render(
    <DashboardOverview
      data={dashboardSnapshot({
        inProgressTasks: [
          taskSummary({
            subtasks,
          }),
        ],
      })}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Show subtasks for Draft launch checklist" }),
  );
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

  test("renames a subtask title optimistically and patches the subtask", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderExpandedSubtasks([
      { id: "subtask-brief", isComplete: false, title: "Draft intro copy" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit subtask Draft intro copy" }));

    const input = screen.getByRole("textbox", {
      name: "Subtask title for Draft intro copy",
    });

    fireEvent.change(input, { target: { value: "Revise intro copy" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Edit subtask Revise intro copy" })).toBeDefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subtasks/subtask-brief");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Revise intro copy" });

    resolveFetch(apiResponse({ ok: true }));

    await waitFor(() => expect(navigationMock.refresh).toHaveBeenCalledTimes(1));
  });

  test("reverts an empty subtask title without patching", () => {
    renderExpandedSubtasks([
      { id: "subtask-brief", isComplete: false, title: "Draft intro copy" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit subtask Draft intro copy" }));
    const input = screen.getByRole("textbox", {
      name: "Subtask title for Draft intro copy",
    });

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit subtask Draft intro copy" })).toBeDefined();
  });

  test("cancels subtask title editing with Escape without patching", () => {
    renderExpandedSubtasks([
      { id: "subtask-brief", isComplete: false, title: "Draft intro copy" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit subtask Draft intro copy" }));
    const input = screen.getByRole("textbox", {
      name: "Subtask title for Draft intro copy",
    });

    fireEvent.change(input, { target: { value: "Revise intro copy" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit subtask Draft intro copy" })).toBeDefined();
  });

  test("reverts an unchanged subtask title without patching", () => {
    renderExpandedSubtasks([
      { id: "subtask-brief", isComplete: false, title: "Draft intro copy" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit subtask Draft intro copy" }));
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Subtask title for Draft intro copy" }),
      { key: "Enter" },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit subtask Draft intro copy" })).toBeDefined();
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

describe("DashboardOverview board health panel", () => {
  test("renders boards with open and overdue counts", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          boardHealth: [
            {
              accentColor: null,
              iconKey: "briefcase",
              name: "Launch Plan",
              openCount: 3,
              overdueCount: 1,
              slug: "launch-plan",
            },
          ],
        })}
      />,
    );

    const boardHealthLink = screen.getByText("1 overdue").closest("a");

    expect(boardHealthLink?.getAttribute("href")).toBe("/boards/launch-plan");
    expect(boardHealthLink?.textContent).toContain("Launch Plan");
    expect(screen.getByText("1 overdue")).toBeDefined();
    expect(screen.getByText("3 open")).toBeDefined();
  });

  test("omits the overdue count when a board has none", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          boardHealth: [
            {
              accentColor: null,
              iconKey: "briefcase",
              name: "Launch Plan",
              openCount: 2,
              overdueCount: 0,
              slug: "launch-plan",
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText("0 overdue")).toBeNull();
    expect(screen.getByText("2 open")).toBeDefined();
  });

  test("shows an all-caught-up empty state when no board has open work", () => {
    render(<DashboardOverview data={dashboardSnapshot({ boardHealth: [] })} />);

    expect(screen.getByText("Every board is caught up.")).toBeDefined();
  });
});

describe("DashboardOverview snapshot ring", () => {
  afterEach(() => {
    cleanup();
  });

  test("the ring reflects completion rate, not total task volume", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          activeTaskCount: 4,
          completionRate: 40,
          doneCount: 2,
          totalTaskCount: 20,
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "40% of active work is done" })).toBeDefined();
    expect(screen.queryByText("20")).toBeNull();
    expect(screen.queryByRole("img", { name: /task breakdown/i })).toBeNull();
  });

  test("shows 0% when every task is archived and none are active", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          activeTaskCount: 0,
          completionRate: 0,
          doneCount: 0,
          inProgressTasks: [],
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "0% of active work is done" })).toBeDefined();
  });
});

describe("DashboardOverview overdue and due soon panel", () => {
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

  test("renders overdue tasks with a due date and an upbeat empty state for due soon", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          overdueTasks: [
            taskSummary({
              dueDate: "2026-01-01T00:00:00.000Z",
              id: "task-overdue",
              title: "Renew SSL certificate",
            }),
          ],
          upcomingTasks: [],
        })}
      />,
    );

    expect(screen.getByText("Renew SSL certificate")).toBeDefined();
    expect(screen.getByText("Jan 1")).toBeDefined();
    expect(screen.getByText("Nothing due in the next 7 days.")).toBeDefined();
  });

  test("renders due-soon tasks and an upbeat empty state for overdue", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          overdueTasks: [],
          upcomingTasks: [
            taskSummary({
              dueDate: "2026-07-20T00:00:00.000Z",
              id: "task-upcoming",
              title: "Renew domain",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Renew domain")).toBeDefined();
    expect(screen.getByText("Nothing overdue — nice work.")).toBeDefined();
  });

  test("marks an overdue task done and removes it from the list", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));

    render(
      <DashboardOverview
        data={dashboardSnapshot({
          overdueTasks: [taskSummary({ id: "task-overdue", title: "Renew SSL certificate" })],
          upcomingTasks: [],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark Renew SSL certificate done" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-overdue/done",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("Renew SSL certificate")).toBeNull());
  });

  test("marks a due-soon task done and removes it from the list", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));

    render(
      <DashboardOverview
        data={dashboardSnapshot({
          overdueTasks: [],
          upcomingTasks: [taskSummary({ id: "task-upcoming", title: "Renew domain" })],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark Renew domain done" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-upcoming/done",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("Renew domain")).toBeNull());
  });
});

describe("DashboardOverview this week panel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("buckets upcoming tasks by due day and labels today", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          upcomingTasks: [
            taskSummary({ id: "task-today", dueDate: "2026-07-14T00:00:00.000Z" }),
            taskSummary({ id: "task-today-2", dueDate: "2026-07-14T00:00:00.000Z" }),
            taskSummary({ id: "task-thursday", dueDate: "2026-07-16T00:00:00.000Z" }),
          ],
        })}
      />,
    );

    expect(screen.getByLabelText("Today: 2 due")).toBeDefined();
    expect(screen.getByLabelText("Thu: 1 due")).toBeDefined();
    expect(screen.getByLabelText("Wed: 0 due")).toBeDefined();
  });

  test("shows an empty state when nothing is due this week", () => {
    render(<DashboardOverview data={dashboardSnapshot({ upcomingTasks: [] })} />);

    expect(screen.getByText("Nothing on the calendar this week.")).toBeDefined();
  });
});

describe("DashboardOverview recently completed panel", () => {
  test("renders completed tasks with a completion date", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          recentlyCompletedTasks: [
            taskSummary({
              completedAt: "2026-07-12T00:00:00.000Z",
              id: "task-done",
              status: "DONE",
              title: "Ship the release notes",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Ship the release notes")).toBeDefined();
    expect(screen.getByText("Jul 12")).toBeDefined();
  });

  test("shows an empty state when nothing has been completed recently", () => {
    render(<DashboardOverview data={dashboardSnapshot({ recentlyCompletedTasks: [] })} />);

    expect(screen.getByText("Nothing completed in the last 7 days yet.")).toBeDefined();
  });
});

describe("DashboardOverview needs attention panel", () => {
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

  test("renders stale tasks with a last-touched date", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          staleTasks: [
            taskSummary({
              id: "task-stale",
              title: "Forgotten migration doc",
              updatedAt: "2026-06-01T00:00:00.000Z",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Forgotten migration doc")).toBeDefined();
    expect(screen.getByText(/Last touched Jun 1/)).toBeDefined();
  });

  test("shows an upbeat empty state when nothing is stale", () => {
    render(<DashboardOverview data={dashboardSnapshot({ staleTasks: [] })} />);

    expect(
      screen.getByText("Nothing's been sitting untouched — you're on top of it."),
    ).toBeDefined();
  });

  test("marks a stale task done and removes it from the list", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));

    render(
      <DashboardOverview
        data={dashboardSnapshot({
          staleTasks: [taskSummary({ id: "task-stale", title: "Forgotten migration doc" })],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark Forgotten migration doc done" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-stale/done",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("Forgotten migration doc")).toBeNull());
  });
});

describe("DashboardOverview on deck panel", () => {
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

  test("renders on-deck tasks with a queued date", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          onDeckTasks: [
            taskSummary({
              createdAt: "2026-06-15T00:00:00.000Z",
              id: "task-on-deck",
              status: "ON_DECK",
              title: "Design the onboarding flow",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Design the onboarding flow")).toBeDefined();
    expect(screen.getByText(/Queued Jun 15/)).toBeDefined();
  });

  test("shows an empty state when nothing is queued", () => {
    render(<DashboardOverview data={dashboardSnapshot({ onDeckTasks: [] })} />);

    expect(screen.getByText("Nothing queued up right now.")).toBeDefined();
  });

  test("marks an on-deck task done and removes it from the list", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ ok: true }));

    render(
      <DashboardOverview
        data={dashboardSnapshot({
          onDeckTasks: [taskSummary({ id: "task-on-deck", title: "Design the onboarding flow" })],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark Design the onboarding flow done" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-on-deck/done",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(screen.queryByText("Design the onboarding flow")).toBeNull());
  });
});

describe("DashboardOverview active tokens panel", () => {
  test("does not render the section for a non-admin, even with tokens present", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          activeTokens: [
            {
              createdAt: "2026-06-01T00:00:00.000Z",
              expiresAt: null,
              id: "token-1",
              label: "My Agent",
              lastUsedAt: "2026-07-10T00:00:00.000Z",
              scopes: ["TASKS_READ"],
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText("Active Tokens")).toBeNull();
    expect(screen.queryByText("My Agent")).toBeNull();
  });

  test("renders tokens with scopes and last-used freshness for an admin", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          activeTokens: [
            {
              createdAt: "2026-06-01T00:00:00.000Z",
              expiresAt: null,
              id: "token-1",
              label: "My Agent",
              lastUsedAt: "2026-07-10T00:00:00.000Z",
              scopes: ["TASKS_READ"],
            },
          ],
        })}
        isAdmin
      />,
    );

    expect(screen.getByText("Active Tokens")).toBeDefined();
    expect(screen.getByText("My Agent")).toBeDefined();
    expect(screen.getByText("Tasks read")).toBeDefined();
    expect(screen.getByText(/Used Jul 10/)).toBeDefined();
  });

  test("shows never-used tokens distinctly and an empty state when there are none", () => {
    render(
      <DashboardOverview
        data={dashboardSnapshot({
          activeTokens: [
            {
              createdAt: "2026-06-01T00:00:00.000Z",
              expiresAt: null,
              id: "token-1",
              label: "Fresh Token",
              lastUsedAt: null,
              scopes: ["BOARDS_READ"],
            },
          ],
        })}
        isAdmin
      />,
    );

    expect(screen.getByText("Never used")).toBeDefined();

    cleanup();

    render(<DashboardOverview data={dashboardSnapshot({ activeTokens: [] })} isAdmin />);

    expect(screen.getByText("No active API tokens yet.")).toBeDefined();
  });
});
