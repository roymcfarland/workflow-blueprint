import { TaskStatus as PrismaTaskStatus } from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { POST as reorderTasks } from "@/app/api/tasks/reorder/route";
import { prisma } from "@/lib/db";
import { starterBoard } from "@/lib/domain";
import { createTestUser, resetDatabase } from "../helpers/database";
import { jsonRequest } from "../helpers/requests";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarLabel: string | null;
  role: "ADMIN" | "USER";
  themePreference: "day" | "night" | "system";
  passwordChangedAt: Date;
};

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const authState = vi.hoisted(() => ({
  user: null as AuthUser | null,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => authState.user),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function authenticate(user: TestUser) {
  authState.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarLabel: user.avatarLabel,
    role: user.role,
    themePreference: "day",
    passwordChangedAt: user.passwordChangedAt,
  };
}

function createBoard(userId: string, slug: string) {
  return prisma.board.create({
    data: {
      description: starterBoard.description,
      iconKey: starterBoard.iconKey,
      id: randomUUID(),
      name: slug,
      slug,
      sortOrder: 0,
      userId,
    },
  });
}

function createTask({
  boardId,
  id = randomUUID(),
  sortOrder = 0,
  status = PrismaTaskStatus.ON_DECK,
  title = "Task",
}: {
  boardId: string;
  id?: string;
  sortOrder?: number;
  status?: PrismaTaskStatus;
  title?: string;
}) {
  return prisma.task.create({
    data: {
      archivedAt: null,
      boardId,
      completedAt: null,
      description: null,
      dueDate: null,
      id,
      priority: "NONE",
      sortOrder,
      status,
      title,
    },
  });
}

async function expectOk(response: Response) {
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ ok: true });
}

async function expectBadRequest(response: Response, message: string) {
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ message });
}

describe("task reorder route handler", () => {
  beforeEach(async () => {
    await resetDatabase();
    authState.user = null;
    vi.mocked(revalidatePath).mockClear();
  });

  test("POST /api/tasks/reorder updates status and sort order within a board", async () => {
    const user = await createTestUser();
    const board = await createBoard(user.id, "launch-plan");
    const first = await createTask({ boardId: board.id, sortOrder: 0, title: "First" });
    const second = await createTask({ boardId: board.id, sortOrder: 1, title: "Second" });
    authenticate(user);

    await expectOk(
      await reorderTasks(
        jsonRequest("/api/tasks/reorder", {
          items: [
            { sortOrder: 0, status: "IN_PROGRESS", taskId: second.id },
            { sortOrder: 0, status: "ON_DECK", taskId: first.id },
          ],
        }),
      ),
    );

    await expect(
      prisma.task.findMany({
        orderBy: { id: "asc" },
        select: { id: true, sortOrder: true, status: true },
        where: { id: { in: [first.id, second.id] } },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { id: first.id, sortOrder: 0, status: PrismaTaskStatus.ON_DECK },
        { id: second.id, sortOrder: 0, status: PrismaTaskStatus.IN_PROGRESS },
      ]),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/boards/${board.slug}`);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  test("POST /api/tasks/reorder rejects another user's task", async () => {
    const owner = await createTestUser({ email: "task-owner@example.test" });
    const otherUser = await createTestUser({ email: "task-other@example.test" });
    const ownerBoard = await createBoard(owner.id, "owner-board");
    const otherBoard = await createBoard(otherUser.id, "other-board");
    const ownerTask = await createTask({ boardId: ownerBoard.id, title: "Owner task" });
    const otherTask = await createTask({ boardId: otherBoard.id, title: "Other task" });
    authenticate(owner);

    await expectBadRequest(
      await reorderTasks(
        jsonRequest("/api/tasks/reorder", {
          items: [{ sortOrder: 0, status: "IN_PROGRESS", taskId: otherTask.id }],
        }),
      ),
      "One or more tasks could not be found.",
    );

    await expect(
      prisma.task.findMany({
        orderBy: { id: "asc" },
        select: { id: true, sortOrder: true, status: true },
        where: { id: { in: [ownerTask.id, otherTask.id] } },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { id: ownerTask.id, sortOrder: 0, status: PrismaTaskStatus.ON_DECK },
        { id: otherTask.id, sortOrder: 0, status: PrismaTaskStatus.ON_DECK },
      ]),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("POST /api/tasks/reorder rejects a payload spanning two boards", async () => {
    const user = await createTestUser();
    const firstBoard = await createBoard(user.id, "first-board");
    const secondBoard = await createBoard(user.id, "second-board");
    const firstTask = await createTask({ boardId: firstBoard.id, title: "First board task" });
    const secondTask = await createTask({ boardId: secondBoard.id, title: "Second board task" });
    authenticate(user);

    await expectBadRequest(
      await reorderTasks(
        jsonRequest("/api/tasks/reorder", {
          items: [
            { sortOrder: 0, status: "IN_PROGRESS", taskId: firstTask.id },
            { sortOrder: 0, status: "DONE", taskId: secondTask.id },
          ],
        }),
      ),
      "Tasks must belong to a single board.",
    );

    await expect(
      prisma.task.findMany({
        orderBy: { id: "asc" },
        select: { id: true, sortOrder: true, status: true },
        where: { id: { in: [firstTask.id, secondTask.id] } },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { id: firstTask.id, sortOrder: 0, status: PrismaTaskStatus.ON_DECK },
        { id: secondTask.id, sortOrder: 0, status: PrismaTaskStatus.ON_DECK },
      ]),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("POST /api/tasks/reorder requires authentication", async () => {
    const response = await reorderTasks(
      jsonRequest("/api/tasks/reorder", {
        items: [{ sortOrder: 0, status: "IN_PROGRESS", taskId: "nonexistent" }],
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication is required." });
  });

  test("POST /api/tasks/reorder returns 403 for a cross-origin request", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await reorderTasks(
      jsonRequest(
        "/api/tasks/reorder",
        { items: [] },
        { headers: { origin: "https://evil.example" } },
      ),
    );

    expect(response.status).toBe(403);
  });

  test("POST /api/tasks/reorder returns 429 when the tasks-reorder rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await prisma.rateLimitBucket.create({
      data: {
        key: `tasks-reorder:local:${user.id.toLowerCase()}`,
        count: 180,
        resetAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await reorderTasks(jsonRequest("/api/tasks/reorder", { items: [] }));

    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(true);
  });

  test("POST /api/tasks/reorder returns 400 for an invalid payload", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await reorderTasks(jsonRequest("/api/tasks/reorder", { items: [] }));

    expect(response.status).toBe(400);
  });
});
