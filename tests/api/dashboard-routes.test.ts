import {
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { POST as reorderDashboardInProgress } from "@/app/api/dashboard/in-progress/reorder/route";
import { POST as markTaskDone } from "@/app/api/tasks/[taskId]/done/route";
import { prisma } from "@/lib/db";
import { starterBoard } from "@/lib/domain";
import { createTestBoard, createTestUser, resetDatabase } from "../helpers/database";
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

function taskParams(taskId: string) {
  return {
    params: Promise.resolve({ taskId }),
  };
}

function requestWithoutBody(path: string, method: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL(path, origin), {
    headers: {
      origin,
    },
    method,
  });
}

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

async function createBoard(userId: string, sortOrder = 0) {
  return prisma.board.create({
    data: {
      description: starterBoard.description,
      iconKey: starterBoard.iconKey,
      id: randomUUID(),
      name: `Board ${sortOrder}`,
      slug: `board-${sortOrder}`,
      sortOrder,
      userId,
    },
  });
}

async function createTask({
  boardId,
  dashboardSortOrder,
  id = randomUUID(),
  sortOrder = 0,
  status = PrismaTaskStatus.IN_PROGRESS,
  title = "Task",
}: {
  boardId: string;
  dashboardSortOrder?: number | null;
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
      dashboardSortOrder,
      description: null,
      dueDate: null,
      id,
      priority: PrismaItemPriority.NONE,
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

async function expectDoneResponse(response: Response) {
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    task: {
      status: PrismaTaskStatus.DONE,
    },
  });
}

async function expectBadRequest(response: Response, message: string) {
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ message });
}

describe("dashboard route handlers", () => {
  beforeEach(async () => {
    await resetDatabase();
    authState.user = null;
    vi.mocked(revalidatePath).mockClear();
  });

  test("POST /api/dashboard/in-progress/reorder assigns dashboard sort order", async () => {
    const user = await createTestUser();
    const board = await createBoard(user.id);
    const first = await createTask({ boardId: board.id, sortOrder: 7, title: "First" });
    const second = await createTask({ boardId: board.id, sortOrder: 3, title: "Second" });
    authenticate(user);

    await expectOk(
      await reorderDashboardInProgress(
        jsonRequest("/api/dashboard/in-progress/reorder", {
          taskIds: [second.id, first.id],
        }),
      ),
    );

    const tasks = await prisma.task.findMany({
      orderBy: {
        dashboardSortOrder: "asc",
      },
      select: {
        dashboardSortOrder: true,
        id: true,
        sortOrder: true,
      },
      where: {
        id: {
          in: [first.id, second.id],
        },
      },
    });

    expect(tasks).toEqual([
      { dashboardSortOrder: 0, id: second.id, sortOrder: 3 },
      { dashboardSortOrder: 1, id: first.id, sortOrder: 7 },
    ]);
    expect(revalidatePath).not.toHaveBeenCalledWith(`/boards/${board.slug}`);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  test("POST /api/dashboard/in-progress/reorder hides tasks outside the dashboard list", async () => {
    const user = await createTestUser();
    const board = await createBoard(user.id);
    const task = await createTask({
      boardId: board.id,
      status: PrismaTaskStatus.ON_DECK,
    });
    authenticate(user);

    await expectBadRequest(
      await reorderDashboardInProgress(
        jsonRequest("/api/dashboard/in-progress/reorder", {
          taskIds: [task.id],
        }),
      ),
      "One or more tasks could not be found.",
    );

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("POST /api/tasks/[taskId]/done moves a task to the board done column", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    await createTask({
      boardId: board.id,
      sortOrder: 0,
      status: PrismaTaskStatus.DONE,
      title: "Already done",
    });
    const task = await createTask({
      boardId: board.id,
      sortOrder: 7,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Finish",
    });
    authenticate(user);

    await expectDoneResponse(
      await markTaskDone(
        requestWithoutBody(`/api/tasks/${task.id}/done`, "POST"),
        taskParams(task.id),
      ),
    );

    await expect(
      prisma.task.findUniqueOrThrow({
        select: {
          archivedAt: true,
          completedAt: true,
          sortOrder: true,
          status: true,
        },
        where: { id: task.id },
      }),
    ).resolves.toMatchObject({
      archivedAt: null,
      completedAt: expect.any(Date),
      sortOrder: 1,
      status: PrismaTaskStatus.DONE,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/boards/${board.slug}`);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  test("POST /api/tasks/[taskId]/done hides another user's task", async () => {
    const owner = await createTestUser({ email: "route-owner@example.test" });
    const otherUser = await createTestUser({ email: "route-other@example.test" });
    const otherBoard = await createTestBoard(otherUser.id);
    const otherTask = await createTask({ boardId: otherBoard.id });
    authenticate(owner);

    await expectBadRequest(
      await markTaskDone(
        requestWithoutBody(`/api/tasks/${otherTask.id}/done`, "POST"),
        taskParams(otherTask.id),
      ),
      "Task not found.",
    );

    await expect(
      prisma.task.findUniqueOrThrow({
        select: {
          status: true,
        },
        where: { id: otherTask.id },
      }),
    ).resolves.toEqual({ status: PrismaTaskStatus.IN_PROGRESS });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
