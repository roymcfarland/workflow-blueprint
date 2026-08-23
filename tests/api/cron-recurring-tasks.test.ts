import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data")>();

  return {
    ...actual,
    purgeExpiredDemoUsers: vi.fn(actual.purgeExpiredDemoUsers),
  };
});

import { GET } from "@/app/api/cron/recurring-tasks/route";
import { createTaskForBoard, purgeExpiredDemoUsers as purgeExpiredDemoUsersData } from "@/lib/data";
import { prisma } from "@/lib/db";
import { starterBoard } from "@/lib/domain";
import { createTestBoard, createTestUser, resetDatabase } from "../helpers/database";

function cronRequest(authorization?: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL("/api/cron/recurring-tasks", origin), {
    headers: authorization ? { authorization } : {},
    method: "GET",
  });
}

describe("GET /api/cron/recurring-tasks", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("rejects a request with no Authorization header", async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
  });

  test("rejects a request with the wrong secret", async () => {
    const response = await GET(cronRequest("Bearer wrong-secret"));

    expect(response.status).toBe(401);
  });

  test("rolls over due recurring tasks when the secret matches", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const expiredDemoUser = await createTestUser({ email: "expired-demo@example.test" });
    await prisma.user.update({
      data: { demoExpiresAt: new Date(Date.now() - 60_000) },
      where: { id: expiredDemoUser.id },
    });

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: "2026-01-01",
      priority: "NONE",
      recurrence: "DAILY",
      status: "IN_PROGRESS",
      subtasks: [],
      title: "Stale daily task",
    });

    const response = await GET(cronRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      purgedDemoUserCount: 1,
      rolledOverCount: 1,
      rolledOverTaskIds: [task.id],
      skippedCount: 0,
      skippedTaskIds: [],
    });
    await expect(
      prisma.user.findUnique({ where: { id: expiredDemoUser.id } }),
    ).resolves.toBeNull();
  });

  test("keeps a completed rollover when demo purging fails", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: "2026-01-01",
      priority: "NONE",
      recurrence: "DAILY",
      status: "DONE",
      subtasks: [],
      title: "Completed stale daily task",
    });
    vi.mocked(purgeExpiredDemoUsersData).mockRejectedValueOnce(new Error("Demo purge failed."));

    await expect(
      GET(cronRequest(`Bearer ${process.env.CRON_SECRET}`)),
    ).rejects.toThrow("Demo purge failed.");

    await expect(
      prisma.task.findUniqueOrThrow({
        select: { completedAt: true, dueDate: true, status: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({
      completedAt: null,
      dueDate: new Date(new Date().setUTCHours(0, 0, 0, 0)),
      status: "IN_PROGRESS",
    });
  });
});
