import {
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { DELETE as deleteTask, PATCH as updateTask } from "@/app/api/tasks/[taskId]/route";
import { POST as createAttachmentRecord } from "@/app/api/tasks/[taskId]/attachments/route";
import { POST as createAttachmentUploadUrl } from "@/app/api/tasks/[taskId]/attachments/upload-url/route";
import { POST as createChecklistItem } from "@/app/api/tasks/[taskId]/checklist/route";
import { POST as createLabel } from "@/app/api/tasks/[taskId]/labels/route";
import { prisma } from "@/lib/db";
import { createSignedUploadUrl } from "@/lib/storage";
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
    priority: string;
    status: string;
    title: string;
    attachments: Array<{
      id: string;
      fileName: string;
    }>;
    checklist: Array<{
      id: string;
      isComplete: boolean;
      text: string;
    }>;
    labels: Array<{
      id: string;
      color: string;
      text: string;
    }>;
  };
};

type UploadUrlResponse = {
  ok: true;
  uploadUrl: string;
  token: string;
  path: string;
  contentType: string;
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

vi.mock("@/lib/storage", () => ({
  createSignedUploadUrl: vi.fn(async () => ({
    uploadUrl: "https://storage.test/upload",
    token: "tok_123",
    path: "unused",
  })),
}));

function taskParams(taskId: string) {
  return {
    params: Promise.resolve({ taskId }),
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

function validTaskPatchBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Updated title",
    description: null,
    status: "IN_PROGRESS",
    dueDate: null,
    priority: "NONE",
    recurrence: "NONE",
    subtasks: [],
    ...overrides,
  };
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

function requestWithoutBody(path: string, method: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL(path, origin), {
    headers: {
      "content-type": "application/json",
      origin,
    },
    method,
  });
}

async function expectTaskResponse(response: Response) {
  expect(response.status).toBe(200);

  return (await response.json()) as TaskMutationResponse;
}

async function expectErrorResponse(response: Response, status: number, message: string) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ message });
}

beforeEach(async () => {
  await resetDatabase();
  authState.user = null;
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(createSignedUploadUrl).mockClear();
});

describe("task detail routes", () => {
  test("PATCH returns 401 when unauthenticated", async () => {
    const response = await updateTask(
      jsonRequest("/api/tasks/nonexistent", validTaskPatchBody(), { method: "PATCH" }),
      taskParams("nonexistent"),
    );

    expect(response.status).toBe(401);
  });

  test("PATCH returns 403 for a cross-origin request", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await updateTask(
      jsonRequest("/api/tasks/nonexistent", validTaskPatchBody(), {
        headers: { origin: "https://evil.example" },
        method: "PATCH",
      }),
      taskParams("nonexistent"),
    );

    expect(response.status).toBe(403);
  });

  test("PATCH returns 429 when the tasks-update rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await prisma.rateLimitBucket.create({
      data: {
        key: `tasks-update:local:${user.id.toLowerCase()}`,
        count: 120,
        resetAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await updateTask(
      jsonRequest("/api/tasks/nonexistent", validTaskPatchBody(), { method: "PATCH" }),
      taskParams("nonexistent"),
    );

    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(true);
  });

  test("PATCH updates title, status, and priority", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    const response = await updateTask(
      jsonRequest(
        `/api/tasks/${task.id}`,
        validTaskPatchBody({
          title: "Ready to launch",
          priority: "HIGH",
        }),
        { method: "PATCH" },
      ),
      taskParams(task.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task).toMatchObject({
      id: task.id,
      priority: "HIGH",
      status: "IN_PROGRESS",
      title: "Ready to launch",
    });
  });

  test("PATCH rejects an empty title", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    await expectErrorResponse(
      await updateTask(
        jsonRequest(`/api/tasks/${task.id}`, validTaskPatchBody({ title: "   " }), {
          method: "PATCH",
        }),
        taskParams(task.id),
      ),
      400,
      "Task title is required.",
    );
  });

  test("PATCH hides a task owned by another user", async () => {
    const { task } = await seedTask();
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await updateTask(
        jsonRequest(`/api/tasks/${task.id}`, validTaskPatchBody(), { method: "PATCH" }),
        taskParams(task.id),
      ),
      400,
      "Task not found.",
    );
  });

  test("DELETE returns 401 when unauthenticated", async () => {
    const response = await deleteTask(
      requestWithoutBody("/api/tasks/nonexistent", "DELETE"),
      taskParams("nonexistent"),
    );

    expect(response.status).toBe(401);
  });

  test("DELETE returns 403 for a cross-origin request", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await deleteTask(
      jsonRequest(
        "/api/tasks/nonexistent",
        {},
        { method: "DELETE", headers: { origin: "https://evil.example" } },
      ),
      taskParams("nonexistent"),
    );

    expect(response.status).toBe(403);
  });

  test("DELETE returns 429 when the tasks-delete rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await prisma.rateLimitBucket.create({
      data: {
        key: `tasks-delete:local:${user.id.toLowerCase()}`,
        count: 120,
        resetAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await deleteTask(
      requestWithoutBody("/api/tasks/nonexistent", "DELETE"),
      taskParams("nonexistent"),
    );

    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(true);
  });

  test("DELETE removes the task and returns only the success flag", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    const response = await deleteTask(
      requestWithoutBody(`/api/tasks/${task.id}`, "DELETE"),
      taskParams(task.id),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await expect(prisma.task.findUnique({ where: { id: task.id } })).resolves.toBeNull();
  });

  test("DELETE hides a task owned by another user", async () => {
    const { task } = await seedTask();
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await deleteTask(
        requestWithoutBody(`/api/tasks/${task.id}`, "DELETE"),
        taskParams(task.id),
      ),
      400,
      "Task not found.",
    );
  });
});

describe("checklist item creation", () => {
  test("POST creates a checklist item", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    const response = await createChecklistItem(
      jsonRequest(`/api/tasks/${task.id}/checklist`, { text: "Confirm launch date" }),
      taskParams(task.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.checklist).toEqual([
      expect.objectContaining({
        isComplete: false,
        text: "Confirm launch date",
      }),
    ]);
  });

  test("POST rejects empty checklist text", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    await expectErrorResponse(
      await createChecklistItem(
        jsonRequest(`/api/tasks/${task.id}/checklist`, { text: "   " }),
        taskParams(task.id),
      ),
      400,
      "Checklist item is required.",
    );
  });

  test("POST hides a task owned by another user", async () => {
    const { task } = await seedTask();
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await createChecklistItem(
        jsonRequest(`/api/tasks/${task.id}/checklist`, { text: "Should not create" }),
        taskParams(task.id),
      ),
      400,
      "Task not found.",
    );
  });
});

describe("label creation", () => {
  test("POST creates a label", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    const response = await createLabel(
      jsonRequest(`/api/tasks/${task.id}/labels`, {
        text: "Urgent",
        color: "#ef4444",
      }),
      taskParams(task.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.labels).toEqual([
      expect.objectContaining({
        color: "#ef4444",
        text: "Urgent",
      }),
    ]);
  });

  test("POST rejects an invalid label color", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    const response = await createLabel(
      jsonRequest(`/api/tasks/${task.id}/labels`, {
        text: "Invalid",
        color: "#000000",
      }),
      taskParams(task.id),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: expect.any(String) });
  });

  test("POST hides a task owned by another user", async () => {
    const { task } = await seedTask();
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await createLabel(
        jsonRequest(`/api/tasks/${task.id}/labels`, {
          text: "Should not create",
          color: "#ef4444",
        }),
        taskParams(task.id),
      ),
      400,
      "Task not found.",
    );
  });

  test("POST rejects an eleventh label", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    await prisma.taskLabel.createMany({
      data: Array.from({ length: 10 }, (_, sortOrder) => ({
        id: randomUUID(),
        taskId: task.id,
        text: `Existing label ${sortOrder}`,
        color: "#3b82f6",
        sortOrder,
      })),
    });

    await expectErrorResponse(
      await createLabel(
        jsonRequest(`/api/tasks/${task.id}/labels`, {
          text: "One too many",
          color: "#ef4444",
        }),
        taskParams(task.id),
      ),
      400,
      "Tasks can include up to 10 labels.",
    );
  });
});

describe("attachment record creation", () => {
  test("POST creates an attachment record for the task's storage path", async () => {
    const { task, user } = await seedTask();
    const storagePath = `tasks/${task.id}/launch-plan.pdf`;
    authenticate(user);

    const response = await createAttachmentRecord(
      jsonRequest(`/api/tasks/${task.id}/attachments`, {
        fileName: "launch-plan.pdf",
        contentType: "application/pdf",
        size: 2048,
        storagePath,
      }),
      taskParams(task.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.attachments).toEqual([
      expect.objectContaining({
        fileName: "launch-plan.pdf",
      }),
    ]);
    const [attachment] = body.task.attachments;

    if (!attachment) {
      throw new Error("Expected the task response to include the new attachment.");
    }

    await expect(
      prisma.attachment.findUnique({
        where: { id: attachment.id },
        select: { storagePath: true },
      }),
    ).resolves.toEqual({ storagePath });
  });

  test("POST rejects a storage path belonging to another task", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    await expectErrorResponse(
      await createAttachmentRecord(
        jsonRequest(`/api/tasks/${task.id}/attachments`, {
          fileName: "evil.pdf",
          contentType: "application/pdf",
          size: 2048,
          storagePath: `tasks/${randomUUID()}/evil.pdf`,
        }),
        taskParams(task.id),
      ),
      400,
      "Attachment storage path is invalid.",
    );
  });

  test("POST hides a task owned by another user", async () => {
    const { task } = await seedTask();
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await createAttachmentRecord(
        jsonRequest(`/api/tasks/${task.id}/attachments`, {
          fileName: "should-not-create.pdf",
          contentType: "application/pdf",
          size: 2048,
          storagePath: `tasks/${task.id}/should-not-create.pdf`,
        }),
        taskParams(task.id),
      ),
      400,
      "Task not found.",
    );
  });
});

describe("attachment upload URL creation", () => {
  test("POST returns upload credentials for a task-scoped storage path", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    const response = await createAttachmentUploadUrl(
      jsonRequest(`/api/tasks/${task.id}/attachments/upload-url`, {
        fileName: "launch-plan.pdf",
        contentType: "application/pdf",
        size: 2048,
      }),
      taskParams(task.id),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as UploadUrlResponse;
    expect(body).toMatchObject({
      ok: true,
      uploadUrl: "https://storage.test/upload",
      token: "tok_123",
      contentType: "application/pdf",
    });
    expect(body.path).toMatch(new RegExp(`^tasks/${task.id}/`));
    expect(createSignedUploadUrl).toHaveBeenCalledWith(body.path);
  });

  test("POST hides a task owned by another user before touching storage", async () => {
    const { task } = await seedTask();
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await createAttachmentUploadUrl(
        jsonRequest(`/api/tasks/${task.id}/attachments/upload-url`, {
          fileName: "should-not-upload.pdf",
          contentType: "application/pdf",
          size: 2048,
        }),
        taskParams(task.id),
      ),
      400,
      "Task not found.",
    );
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  test("POST rejects an unsupported content type", async () => {
    const { task, user } = await seedTask();
    authenticate(user);

    const response = await createAttachmentUploadUrl(
      jsonRequest(`/api/tasks/${task.id}/attachments/upload-url`, {
        fileName: "archive.zip",
        contentType: "application/zip",
        size: 2048,
      }),
      taskParams(task.id),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: expect.any(String) });
  });
});
