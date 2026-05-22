import {
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { DELETE as deleteSubtask, PATCH as updateSubtask } from "@/app/api/subtasks/[subtaskId]/route";
import { POST as createSubtask } from "@/app/api/tasks/[taskId]/subtasks/route";
import { POST as reorderSubtasks } from "@/app/api/tasks/[taskId]/subtasks/reorder/route";
import { prisma } from "@/lib/db";
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

type TaskMutationResponse = {
  ok: true;
  task: {
    id: string;
    subtasks: Array<{
      id: string;
      isComplete: boolean;
      priority: string;
      sortOrder: number;
      title: string;
    }>;
  };
};

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

function subtaskParams(subtaskId: string) {
  return {
    params: Promise.resolve({ subtaskId }),
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

async function seedTask(email = "alex@example.test") {
  const user = await createTestUser({ email });
  const board = await createTestBoard(user.id);
  const task = await prisma.task.create({
    data: {
      id: randomUUID(),
      boardId: board.id,
      title: "Draft launch plan",
      description: null,
      status: PrismaTaskStatus.ON_DECK,
      priority: PrismaItemPriority.NONE,
      sortOrder: 0,
      dueDate: null,
      completedAt: null,
      archivedAt: null,
    },
  });

  return { board, task, user };
}

async function seedSubtask(
  taskId: string,
  {
    isComplete = false,
    priority = PrismaItemPriority.NONE,
    sortOrder = 0,
    title = "Existing subtask",
  }: {
    isComplete?: boolean;
    priority?: PrismaItemPriority;
    sortOrder?: number;
    title?: string;
  } = {},
) {
  return prisma.subtask.create({
    data: {
      id: randomUUID(),
      taskId,
      title,
      isComplete,
      priority,
      sortOrder,
    },
  });
}

async function expectTaskResponse(response: Response) {
  expect(response.status).toBe(200);

  return (await response.json()) as TaskMutationResponse;
}

async function expectBadRequest(response: Response, message: string) {
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ message });
}

describe("subtask route handlers", () => {
  beforeEach(async () => {
    await resetDatabase();
    authState.user = null;
    vi.mocked(revalidatePath).mockClear();
  });

  test("POST /api/tasks/[taskId]/subtasks appends the next sort order", async () => {
    const { task, user } = await seedTask();
    await seedSubtask(task.id, { title: "First", sortOrder: 0 });
    await seedSubtask(task.id, { title: "Second", sortOrder: 1 });
    authenticate(user);

    const response = await createSubtask(
      jsonRequest(`/api/tasks/${task.id}/subtasks`, {
        title: "Ship release notes",
        priority: "HIGH",
      }),
      taskParams(task.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.id).toBe(task.id);
    expect(body.task.subtasks).toHaveLength(3);
    expect(body.task.subtasks.at(-1)).toMatchObject({
      isComplete: false,
      priority: "HIGH",
      sortOrder: 2,
      title: "Ship release notes",
    });
  });

  test("POST /api/tasks/[taskId]/subtasks rejects a 51st subtask", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    await prisma.subtask.createMany({
      data: Array.from({ length: 50 }, (_, sortOrder) => ({
        id: randomUUID(),
        taskId: task.id,
        title: `Existing subtask ${sortOrder}`,
        isComplete: false,
        priority: PrismaItemPriority.NONE,
        sortOrder,
      })),
    });

    const response = await createSubtask(
      jsonRequest(`/api/tasks/${task.id}/subtasks`, {
        title: "One too many",
      }),
      taskParams(task.id),
    );

    await expectBadRequest(response, "Tasks can include up to 50 subtasks.");
  });

  test("PATCH /api/subtasks/[subtaskId] updates title, completion, and priority", async () => {
    const { task, user } = await seedTask();
    const subtask = await seedSubtask(task.id, {
      priority: PrismaItemPriority.LOW,
      title: "Original title",
    });
    authenticate(user);

    const response = await updateSubtask(
      jsonRequest(
        `/api/subtasks/${subtask.id}`,
        {
          title: "Updated title",
          isComplete: true,
          priority: "URGENT",
        },
        { method: "PATCH" },
      ),
      subtaskParams(subtask.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.subtasks).toEqual([
      expect.objectContaining({
        id: subtask.id,
        isComplete: true,
        priority: "URGENT",
        title: "Updated title",
      }),
    ]);
  });

  test("PATCH /api/subtasks/[subtaskId] rejects an empty body", async () => {
    const { task, user } = await seedTask();
    const subtask = await seedSubtask(task.id);
    authenticate(user);

    const response = await updateSubtask(
      jsonRequest(`/api/subtasks/${subtask.id}`, {}, { method: "PATCH" }),
      subtaskParams(subtask.id),
    );

    await expectBadRequest(response, "Provide at least one field to update.");
  });

  test("DELETE /api/subtasks/[subtaskId] removes the subtask from the task payload", async () => {
    const { task, user } = await seedTask();
    const removed = await seedSubtask(task.id, { title: "Remove me", sortOrder: 0 });
    const retained = await seedSubtask(task.id, { title: "Keep me", sortOrder: 1 });
    authenticate(user);

    const response = await deleteSubtask(
      requestWithoutBody(`/api/subtasks/${removed.id}`, "DELETE"),
      subtaskParams(removed.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.subtasks).toEqual([
      expect.objectContaining({
        id: retained.id,
        title: "Keep me",
      }),
    ]);
    await expect(prisma.subtask.findUnique({ where: { id: removed.id } })).resolves.toBeNull();
  });

  test("POST /api/tasks/[taskId]/subtasks/reorder assigns sort orders by id order", async () => {
    const { task, user } = await seedTask();
    const first = await seedSubtask(task.id, { title: "First", sortOrder: 0 });
    const second = await seedSubtask(task.id, { title: "Second", sortOrder: 1 });
    const third = await seedSubtask(task.id, { title: "Third", sortOrder: 2 });
    const nextOrder = [third.id, first.id, second.id];
    authenticate(user);

    const response = await reorderSubtasks(
      jsonRequest(`/api/tasks/${task.id}/subtasks/reorder`, {
        subtaskIds: nextOrder,
      }),
      taskParams(task.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.subtasks.map((subtask) => subtask.id)).toEqual(nextOrder);
    expect(body.task.subtasks.map((subtask) => subtask.sortOrder)).toEqual([0, 1, 2]);
  });

  test("POST /api/tasks/[taskId]/subtasks/reorder rejects mismatched id sets", async () => {
    const { task, user } = await seedTask();
    const first = await seedSubtask(task.id, { sortOrder: 0 });
    await seedSubtask(task.id, { sortOrder: 1 });
    authenticate(user);

    const response = await reorderSubtasks(
      jsonRequest(`/api/tasks/${task.id}/subtasks/reorder`, {
        subtaskIds: [first.id, randomUUID()],
      }),
      taskParams(task.id),
    );

    await expectBadRequest(response, "Reorder payload does not match the task's subtasks.");
  });

  test("subtask mutations hide resources owned by another user", async () => {
    const { task } = await seedTask();
    const subtask = await seedSubtask(task.id);
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectBadRequest(
      await createSubtask(
        jsonRequest(`/api/tasks/${task.id}/subtasks`, {
          title: "Should not create",
        }),
        taskParams(task.id),
      ),
      "Task not found.",
    );
    await expectBadRequest(
      await updateSubtask(
        jsonRequest(
          `/api/subtasks/${subtask.id}`,
          {
            title: "Should not update",
          },
          { method: "PATCH" },
        ),
        subtaskParams(subtask.id),
      ),
      "Subtask not found.",
    );
    await expectBadRequest(
      await deleteSubtask(
        requestWithoutBody(`/api/subtasks/${subtask.id}`, "DELETE"),
        subtaskParams(subtask.id),
      ),
      "Subtask not found.",
    );
    await expectBadRequest(
      await reorderSubtasks(
        jsonRequest(`/api/tasks/${task.id}/subtasks/reorder`, {
          subtaskIds: [subtask.id],
        }),
        taskParams(task.id),
      ),
      "Task not found.",
    );
  });

  test("POST /api/tasks/[taskId]/subtasks rejects missing and blank titles", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    const missingTitleResponse = await createSubtask(
      jsonRequest(`/api/tasks/${task.id}/subtasks`, {
        priority: "LOW",
      }),
      taskParams(task.id),
    );

    expect(missingTitleResponse.status).toBe(400);
    await expect(missingTitleResponse.json()).resolves.toEqual({
      message: expect.any(String),
    });

    await expectBadRequest(
      await createSubtask(
        jsonRequest(`/api/tasks/${task.id}/subtasks`, {
          title: "   ",
        }),
        taskParams(task.id),
      ),
      "Subtask title is required.",
    );
  });
});
