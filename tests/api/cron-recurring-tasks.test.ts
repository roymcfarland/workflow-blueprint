import { beforeEach, describe, expect, test } from "vitest";

import { GET } from "@/app/api/cron/recurring-tasks/route";
import { createTaskForBoard } from "@/lib/data";
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

    await createTaskForBoard(user.id, starterBoard.slug, {
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
    expect(body.rolledOverCount).toBe(1);
  });
});
