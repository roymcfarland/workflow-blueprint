import {
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  DELETE as deleteAttachment,
  GET as getAttachmentDownloadUrl,
} from "@/app/api/attachments/[attachmentId]/route";
import {
  DELETE as deleteChecklistItem,
  PATCH as updateChecklistItem,
} from "@/app/api/checklist/[itemId]/route";
import { DELETE as deleteLabel } from "@/app/api/labels/[labelId]/route";
import { prisma } from "@/lib/db";
import { createSignedDownloadUrl, removeStorageObject } from "@/lib/storage";
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
      text: string;
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

vi.mock("@/lib/storage", () => ({
  createSignedDownloadUrl: vi.fn(async () => "https://storage.test/signed-url"),
  removeStorageObject: vi.fn(async () => undefined),
}));

function attachmentParams(attachmentId: string) {
  return {
    params: Promise.resolve({ attachmentId }),
  };
}

function checklistItemParams(itemId: string) {
  return {
    params: Promise.resolve({ itemId }),
  };
}

function labelParams(labelId: string) {
  return {
    params: Promise.resolve({ labelId }),
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

async function seedRateLimit(scope: string, user: TestUser) {
  await prisma.rateLimitBucket.create({
    data: {
      key: `${scope}:local:${user.id.toLowerCase()}`,
      count: 120,
      resetAt: new Date(Date.now() + 60_000),
    },
  });
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

async function seedAttachment(
  taskId: string,
  overrides: Partial<{
    fileName: string;
    contentType: string;
    size: number;
    storagePath: string;
  }> = {},
) {
  return prisma.attachment.create({
    data: {
      id: randomUUID(),
      taskId,
      fileName: overrides.fileName ?? "notes.pdf",
      contentType: overrides.contentType ?? "application/pdf",
      size: overrides.size ?? 1024,
      storagePath: overrides.storagePath ?? `attachments/${randomUUID()}`,
    },
  });
}

async function seedChecklistItem(
  taskId: string,
  overrides: Partial<{
    text: string;
    isComplete: boolean;
    sortOrder: number;
  }> = {},
) {
  return prisma.checklistItem.create({
    data: {
      id: randomUUID(),
      taskId,
      text: overrides.text ?? "Existing item",
      isComplete: overrides.isComplete ?? false,
      sortOrder: overrides.sortOrder ?? 0,
    },
  });
}

async function seedLabel(
  taskId: string,
  overrides: Partial<{
    text: string;
    color: string;
    sortOrder: number;
  }> = {},
) {
  return prisma.taskLabel.create({
    data: {
      id: randomUUID(),
      taskId,
      text: overrides.text ?? "Existing label",
      color: overrides.color ?? "#1f50f2",
      sortOrder: overrides.sortOrder ?? 0,
    },
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

function expectRateLimited(response: Response) {
  expect(response.status).toBe(429);
  expect(response.headers.has("Retry-After")).toBe(true);
}

beforeEach(async () => {
  await resetDatabase();
  authState.user = null;
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(createSignedDownloadUrl).mockClear();
  vi.mocked(removeStorageObject).mockClear();
});

describe("attachment routes", () => {
  test("GET returns a signed URL and file name for the caller's attachment", async () => {
    const { task, user } = await seedTask();
    const attachment = await seedAttachment(task.id, {
      fileName: "launch-notes.pdf",
      storagePath: "attachments/launch-notes.pdf",
    });
    authenticate(user);

    const response = await getAttachmentDownloadUrl(
      requestWithoutBody(`/api/attachments/${attachment.id}`, "GET"),
      attachmentParams(attachment.id),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      url: "https://storage.test/signed-url",
      fileName: "launch-notes.pdf",
    });
    expect(createSignedDownloadUrl).toHaveBeenCalledWith(attachment.storagePath);
  });

  test("GET returns 429 when the attachments-download rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await seedRateLimit("attachments-download", user);

    const response = await getAttachmentDownloadUrl(
      requestWithoutBody("/api/attachments/nonexistent", "GET"),
      attachmentParams("nonexistent"),
    );

    expectRateLimited(response);
  });

  test("GET hides an attachment owned by another user", async () => {
    const { task } = await seedTask();
    const attachment = await seedAttachment(task.id);
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await getAttachmentDownloadUrl(
        requestWithoutBody(`/api/attachments/${attachment.id}`, "GET"),
        attachmentParams(attachment.id),
      ),
      400,
      "Attachment not found.",
    );
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  test("DELETE removes the attachment and returns the updated task", async () => {
    const { task, user } = await seedTask();
    const removed = await seedAttachment(task.id, {
      fileName: "remove.pdf",
      storagePath: "attachments/remove.pdf",
    });
    const retained = await seedAttachment(task.id, {
      fileName: "retain.pdf",
      storagePath: "attachments/retain.pdf",
    });
    authenticate(user);

    const response = await deleteAttachment(
      requestWithoutBody(`/api/attachments/${removed.id}`, "DELETE"),
      attachmentParams(removed.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.attachments).toEqual([
      expect.objectContaining({
        id: retained.id,
        fileName: "retain.pdf",
      }),
    ]);
    expect(removeStorageObject).toHaveBeenCalledWith(removed.storagePath);
    await expect(prisma.attachment.findUnique({ where: { id: removed.id } })).resolves.toBeNull();
  });

  test("DELETE returns 429 when the attachments-delete rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await seedRateLimit("attachments-delete", user);

    const response = await deleteAttachment(
      requestWithoutBody("/api/attachments/nonexistent", "DELETE"),
      attachmentParams("nonexistent"),
    );

    expectRateLimited(response);
  });

  test("DELETE hides an attachment owned by another user", async () => {
    const { task } = await seedTask();
    const attachment = await seedAttachment(task.id);
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await deleteAttachment(
        requestWithoutBody(`/api/attachments/${attachment.id}`, "DELETE"),
        attachmentParams(attachment.id),
      ),
      400,
      "Attachment not found.",
    );
    expect(removeStorageObject).not.toHaveBeenCalled();
  });

  test("GET and DELETE require authentication", async () => {
    const attachmentId = randomUUID();

    await expectErrorResponse(
      await getAttachmentDownloadUrl(
        requestWithoutBody(`/api/attachments/${attachmentId}`, "GET"),
        attachmentParams(attachmentId),
      ),
      401,
      "Authentication is required.",
    );
    await expectErrorResponse(
      await deleteAttachment(
        requestWithoutBody(`/api/attachments/${attachmentId}`, "DELETE"),
        attachmentParams(attachmentId),
      ),
      401,
      "Authentication is required.",
    );
  });
});

describe("checklist item routes", () => {
  test("PATCH updates text and completion", async () => {
    const { task, user } = await seedTask();
    const item = await seedChecklistItem(task.id, { text: "Original item" });
    authenticate(user);

    const response = await updateChecklistItem(
      jsonRequest(
        `/api/checklist/${item.id}`,
        {
          text: "Updated item",
          isComplete: true,
        },
        { method: "PATCH" },
      ),
      checklistItemParams(item.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.checklist).toEqual([
      expect.objectContaining({
        id: item.id,
        isComplete: true,
        text: "Updated item",
      }),
    ]);
  });

  test("PATCH returns 429 when the checklist-update rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await seedRateLimit("checklist-update", user);

    const response = await updateChecklistItem(
      jsonRequest(
        "/api/checklist/nonexistent",
        { text: "Rate limited" },
        { method: "PATCH" },
      ),
      checklistItemParams("nonexistent"),
    );

    expectRateLimited(response);
  });

  test("PATCH rejects an empty body", async () => {
    const { task, user } = await seedTask();
    const item = await seedChecklistItem(task.id);
    authenticate(user);

    const response = await updateChecklistItem(
      jsonRequest(`/api/checklist/${item.id}`, {}, { method: "PATCH" }),
      checklistItemParams(item.id),
    );

    await expectErrorResponse(response, 400, "Provide at least one field to update.");
  });

  test("DELETE removes the checklist item and returns the updated task", async () => {
    const { task, user } = await seedTask();
    const removed = await seedChecklistItem(task.id, { text: "Remove me", sortOrder: 0 });
    const retained = await seedChecklistItem(task.id, { text: "Keep me", sortOrder: 1 });
    authenticate(user);

    const response = await deleteChecklistItem(
      requestWithoutBody(`/api/checklist/${removed.id}`, "DELETE"),
      checklistItemParams(removed.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.checklist).toEqual([
      expect.objectContaining({
        id: retained.id,
        text: "Keep me",
      }),
    ]);
    await expect(prisma.checklistItem.findUnique({ where: { id: removed.id } })).resolves.toBeNull();
  });

  test("DELETE returns 429 when the checklist-delete rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await seedRateLimit("checklist-delete", user);

    const response = await deleteChecklistItem(
      requestWithoutBody("/api/checklist/nonexistent", "DELETE"),
      checklistItemParams("nonexistent"),
    );

    expectRateLimited(response);
  });

  test("PATCH hides a checklist item owned by another user", async () => {
    const { task } = await seedTask();
    const item = await seedChecklistItem(task.id);
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await updateChecklistItem(
        jsonRequest(
          `/api/checklist/${item.id}`,
          { text: "Should not update" },
          { method: "PATCH" },
        ),
        checklistItemParams(item.id),
      ),
      400,
      "Checklist item not found.",
    );
  });

  test("DELETE hides a checklist item owned by another user", async () => {
    const { task } = await seedTask();
    const item = await seedChecklistItem(task.id);
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await deleteChecklistItem(
        requestWithoutBody(`/api/checklist/${item.id}`, "DELETE"),
        checklistItemParams(item.id),
      ),
      400,
      "Checklist item not found.",
    );
  });

  test("PATCH and DELETE require authentication", async () => {
    const itemId = randomUUID();

    await expectErrorResponse(
      await updateChecklistItem(
        jsonRequest(`/api/checklist/${itemId}`, { text: "No access" }, { method: "PATCH" }),
        checklistItemParams(itemId),
      ),
      401,
      "Authentication is required.",
    );
    await expectErrorResponse(
      await deleteChecklistItem(
        requestWithoutBody(`/api/checklist/${itemId}`, "DELETE"),
        checklistItemParams(itemId),
      ),
      401,
      "Authentication is required.",
    );
  });
});

describe("label routes", () => {
  test("DELETE removes the label and returns the updated task", async () => {
    const { task, user } = await seedTask();
    const removed = await seedLabel(task.id, { text: "Remove me", sortOrder: 0 });
    const retained = await seedLabel(task.id, { text: "Keep me", sortOrder: 1 });
    authenticate(user);

    const response = await deleteLabel(
      requestWithoutBody(`/api/labels/${removed.id}`, "DELETE"),
      labelParams(removed.id),
    );
    const body = await expectTaskResponse(response);

    expect(body.task.labels).toEqual([
      expect.objectContaining({
        id: retained.id,
        text: "Keep me",
      }),
    ]);
    await expect(prisma.taskLabel.findUnique({ where: { id: removed.id } })).resolves.toBeNull();
  });

  test("DELETE returns 429 when the labels-delete rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await seedRateLimit("labels-delete", user);

    const response = await deleteLabel(
      requestWithoutBody("/api/labels/nonexistent", "DELETE"),
      labelParams("nonexistent"),
    );

    expectRateLimited(response);
  });

  test("DELETE hides a label owned by another user", async () => {
    const { task } = await seedTask();
    const label = await seedLabel(task.id);
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    await expectErrorResponse(
      await deleteLabel(
        requestWithoutBody(`/api/labels/${label.id}`, "DELETE"),
        labelParams(label.id),
      ),
      400,
      "Label not found.",
    );
  });

  test("DELETE requires authentication", async () => {
    const labelId = randomUUID();

    await expectErrorResponse(
      await deleteLabel(
        requestWithoutBody(`/api/labels/${labelId}`, "DELETE"),
        labelParams(labelId),
      ),
      401,
      "Authentication is required.",
    );
  });
});
