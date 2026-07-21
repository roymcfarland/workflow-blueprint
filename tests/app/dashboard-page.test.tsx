// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const dashboardOverviewMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  getDashboardSnapshot: vi.fn(),
}));

vi.mock("@/components/dashboard-overview", () => ({
  DashboardOverview: (props: Record<string, unknown>) => {
    dashboardOverviewMock(props);

    return <div data-testid="dashboard-overview" />;
  },
}));

import DashboardPage from "@/app/(app)/dashboard/page";
import { requireCurrentUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/data";

beforeEach(() => {
  dashboardOverviewMock.mockReset();
  vi.mocked(requireCurrentUser).mockReset();
  vi.mocked(getDashboardSnapshot).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("DashboardPage", () => {
  test("renders the dashboard with admin access for an admin user", async () => {
    const snapshot = { totalTaskCount: 0 } as never;
    vi.mocked(requireCurrentUser).mockResolvedValueOnce({ id: "admin-1", role: "ADMIN" } as never);
    vi.mocked(getDashboardSnapshot).mockResolvedValueOnce(snapshot);

    render(await DashboardPage());

    expect(screen.getByTestId("dashboard-overview")).toBeDefined();
    expect(getDashboardSnapshot).toHaveBeenCalledWith("admin-1");
    expect(dashboardOverviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: snapshot, isAdmin: true }),
    );
  });

  test("renders the dashboard without admin access for a regular user", async () => {
    const snapshot = { totalTaskCount: 0 } as never;
    vi.mocked(requireCurrentUser).mockResolvedValueOnce({ id: "user-1", role: "USER" } as never);
    vi.mocked(getDashboardSnapshot).mockResolvedValueOnce(snapshot);

    render(await DashboardPage());

    expect(screen.getByTestId("dashboard-overview")).toBeDefined();
    expect(getDashboardSnapshot).toHaveBeenCalledWith("user-1");
    expect(dashboardOverviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: snapshot, isAdmin: false }),
    );
  });
});
