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
    title: "Draft launch checklist",
    ...overrides,
  };
}

function dashboardSnapshot(): DashboardSnapshot {
  const inProgressTasks = [
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
});
