import {
  ApiTokenScope,
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z, type ZodType } from "zod";

import {
  DELETE as deleteBoard,
  GET as getBoard,
  PATCH as patchBoard,
} from "@/app/api/external/v1/boards/[slug]/route";
import { PATCH as patchBoardNote } from "@/app/api/external/v1/boards/[slug]/note/route";
import {
  GET as getBoards,
  POST as postBoard,
} from "@/app/api/external/v1/boards/route";
import { GET as getDailySummary } from "@/app/api/external/v1/daily-summary/route";
import { GET as getDashboard } from "@/app/api/external/v1/dashboard/route";
import {
  DELETE as deleteSubtask,
  PATCH as patchSubtask,
} from "@/app/api/external/v1/subtasks/[id]/route";
import {
  DELETE as deleteTask,
  PATCH as patchTask,
} from "@/app/api/external/v1/tasks/[id]/route";
import { POST as postSubtask } from "@/app/api/external/v1/tasks/[id]/subtasks/route";
import { POST as postTask } from "@/app/api/external/v1/tasks/route";
import { rateLimitKey } from "@/lib/api";
import { createApiToken, revokeApiToken } from "@/lib/data";
import { prisma } from "@/lib/db";
import { demoUser, starterBoard } from "@/lib/domain";
import {
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  externalBoardResponseSchema,
  externalBoardWriteResponseSchema,
  externalBoardsResponseSchema,
  externalDailySummaryResponseSchema,
  externalDashboardResponseSchema,
  externalOkResponseSchema,
  externalTaskResponseSchema,
} from "@/lib/external-contract";
import { evaluateRateLimit } from "@/lib/rate-limit";
import {
  createTestBoard,
  createTestUser,
  resetDatabase,
  seedPlanningData,
} from "../../helpers/database";

type MockSentryScope = {
  setContext(name: string, context: Record<string, unknown>): void;
  setTag(name: string, value: string): void;
};

const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  init: vi.fn(),
  withScope: vi.fn((callback: (scope: MockSentryScope) => void) => {
    callback({
      setContext: vi.fn(),
      setTag: vi.fn(),
    });
  }),
}));

vi.mock("@sentry/nextjs", () => sentryMock);

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const externalRateLimit = {
  limit: 120,
  windowMs: 60_000,
};
const defaultReadApiTokenScopes = [
  ApiTokenScope.BOARDS_READ,
  ApiTokenScope.TASKS_READ,
  ApiTokenScope.SUBTASKS_READ,
];

type StructuredExternalApiLog = {
  kind: "external_api_request";
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  apiKeyPrefix: string | null;
  userId: string | null;
  outcome: string;
  timestamp: string;
};

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function externalUrl(path: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new URL(path, origin);
}

function externalGetRequest(path: string, apiKey = process.env.EXTERNAL_API_KEY ?? "") {
  return new Request(externalUrl(path), {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    method: "GET",
  });
}

function externalGetRequestWithoutAuthorization(path: string) {
  return new Request(externalUrl(path), {
    method: "GET",
  });
}

function externalJsonRequest(
  method: "PATCH" | "POST",
  path: string,
  body: unknown,
  apiKey = process.env.EXTERNAL_API_KEY ?? "",
) {
  return new Request(externalUrl(path), {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method,
  });
}

function externalDeleteRequest(path: string, apiKey = process.env.EXTERNAL_API_KEY ?? "") {
  return new Request(externalUrl(path), {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    method: "DELETE",
  });
}

function externalRawJsonRequest(
  method: "PATCH" | "POST",
  path: string,
  body: string,
  apiKey = process.env.EXTERNAL_API_KEY ?? "",
) {
  return new Request(externalUrl(path), {
    body,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method,
  });
}

function structuredLogLine(index = 0) {
  const call = consoleLogSpy.mock.calls[index];

  if (!call) {
    throw new Error(`Expected structured log call at index ${index}.`);
  }

  expect(call[0]).toEqual(expect.any(String));

  return call[0] as string;
}

function structuredLog(index = 0) {
  return JSON.parse(structuredLogLine(index)) as StructuredExternalApiLog;
}

function resetSentryMock() {
  sentryMock.captureException.mockReset();
  sentryMock.withScope.mockReset();
  sentryMock.withScope.mockImplementation(
    (callback: (scope: MockSentryScope) => void) => {
      callback({
        setContext: vi.fn(),
        setTag: vi.fn(),
      });
    },
  );
}

async function createNamedBoard(userId: string, name: string, slug: string) {
  const board = await createTestBoard(userId);

  return prisma.board.update({
    data: { name, slug },
    where: { id: board.id },
  });
}

async function createRouteTask(boardId: string, title: string) {
  return prisma.task.create({
    data: {
      boardId,
      id: randomUUID(),
      priority: PrismaItemPriority.NONE,
      sortOrder: 0,
      status: PrismaTaskStatus.IN_PROGRESS,
      title,
    },
  });
}

async function createRouteSubtask(
  taskId: string,
  title: string,
  { isComplete = false, sortOrder = 0 } = {},
) {
  return prisma.subtask.create({
    data: {
      id: randomUUID(),
      isComplete,
      sortOrder,
      taskId,
      title,
    },
  });
}

async function expectJsonContract<T>(
  response: Response,
  schema: ZodType<T>,
  expectedStatus = 200,
) {
  const body = await response.json();
  const parsed = schema.safeParse(body);

  expect(response.status).toBe(expectedStatus);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(parsed.success).toBe(true);

  if (!parsed.success) {
    throw new Error("Expected response to match external contract.");
  }

  return parsed.data;
}

function expectRateLimitHeaders(response: Response) {
  const limit = response.headers.get("X-RateLimit-Limit");
  const remaining = response.headers.get("X-RateLimit-Remaining");
  const reset = response.headers.get("X-RateLimit-Reset");

  expect(limit).toMatch(/^\d+$/);
  expect(remaining).toMatch(/^\d+$/);
  expect(reset).toMatch(/^\d+$/);

  return {
    limit: Number(limit),
    remaining: Number(remaining),
    reset: Number(reset),
  };
}

describe("external v1 route contracts", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlanningData();

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    resetSentryMock();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("GET /api/external/v1/dashboard matches the dashboard contract", async () => {
    const response = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));

    await expectJsonContract(response, externalDashboardResponseSchema);
  });

  test("GET /api/external/v1/boards matches the boards contract", async () => {
    const response = await getBoards(externalGetRequest("/api/external/v1/boards"));

    await expectJsonContract(response, externalBoardsResponseSchema);
  });

  test("GET /api/external/v1/boards/[slug] matches the board contract", async () => {
    const response = await getBoard(
      externalGetRequest("/api/external/v1/boards/personal"),
      {
        params: Promise.resolve({ slug: "personal" }),
      },
    );

    await expectJsonContract(response, externalBoardResponseSchema);
  });

  test("GET /api/external/v1/daily-summary matches the daily summary contract", async () => {
    const response = await getDailySummary(
      externalGetRequest("/api/external/v1/daily-summary"),
    );

    await expectJsonContract(response, externalDailySummaryResponseSchema);
  });

  test("GET /api/external/v1/dashboard returns rate-limit headers on success", async () => {
    const startedAtSeconds = Math.floor(Date.now() / 1000);
    const response = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const headers = expectRateLimitHeaders(response);
    const finishedAtSeconds = Math.ceil(Date.now() / 1000);

    expect(response.status).toBe(200);
    expect(headers.limit).toBe(externalRateLimit.limit);
    expect(headers.remaining).toBeGreaterThanOrEqual(0);
    expect(headers.remaining).toBeLessThanOrEqual(externalRateLimit.limit - 1);
    expect(headers.reset).toBeGreaterThanOrEqual(startedAtSeconds);
    expect(headers.reset).toBeLessThanOrEqual(
      finishedAtSeconds + externalRateLimit.windowMs / 1000,
    );
  });

  test("rate-limit remaining decrements across consecutive requests", async () => {
    const first = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const second = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const firstHeaders = expectRateLimitHeaders(first);
    const secondHeaders = expectRateLimitHeaders(second);

    expect(secondHeaders.reset).toBe(firstHeaders.reset);
    expect(secondHeaders.remaining).toBe(firstHeaders.remaining - 1);
  });

  test("rate-limit reset is stable within the same window", async () => {
    const first = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const second = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const firstHeaders = expectRateLimitHeaders(first);
    const secondHeaders = expectRateLimitHeaders(second);

    expect(secondHeaders.reset).toBe(firstHeaders.reset);
  });

  test("GET /api/external/v1/dashboard returns rate-limit headers on auth failure", async () => {
    const response = await getDashboard(
      externalGetRequestWithoutAuthorization("/api/external/v1/dashboard"),
    );
    const headers = expectRateLimitHeaders(response);

    expect(response.status).toBe(401);
    expect(headers.limit).toBe(externalRateLimit.limit);
    expect(headers.remaining).toBe(externalRateLimit.limit - 1);
  });

  test("GET /api/external/v1/dashboard returns rate-limit headers on 429", async () => {
    const request = externalGetRequest("/api/external/v1/dashboard");
    const key = rateLimitKey(request, "external-api");

    for (let count = 0; count <= externalRateLimit.limit; count += 1) {
      await evaluateRateLimit({ key, ...externalRateLimit });
    }

    const response = await getDashboard(request);
    const body = await response.json();
    const headers = expectRateLimitHeaders(response);

    expect(response.status).toBe(429);
    expect(body).toEqual({
      message: "Too many attempts. Please try again shortly.",
    });
    expect(response.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    expect(response.headers.get("X-Request-Id")).toMatch(uuidV4Pattern);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(headers.limit).toBe(externalRateLimit.limit);
    expect(headers.remaining).toBe(0);
  });

  test("GET /api/external/v1/daily-summary rejects an invalid external key", async () => {
    const response = await getDailySummary(
      externalGetRequest("/api/external/v1/daily-summary", "invalid-key"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ ok: false, error: "Invalid API key." });
  });

  describe("DB-issued API token auth", () => {
    test("GET /api/external/v1/dashboard accepts an active DB token", async () => {
      const { token } = await createApiToken({
        createdById: demoUser.id,
        label: "Briefing consumer",
        scopes: defaultReadApiTokenScopes,
      });

      const response = await getDashboard(
        externalGetRequest("/api/external/v1/dashboard", token),
      );
      const log = structuredLog();

      await expectJsonContract(response, externalDashboardResponseSchema);
      expect(log.userId).toBe(demoUser.id);
    });

    test("GET /api/external/v1/boards resolves DB tokens to their owner", async () => {
      const owner = await createTestUser({
        email: "owner@example.test",
        name: "Owner User",
      });
      const otherUser = await createTestUser({
        email: "other@example.test",
        name: "Other User",
      });
      await createNamedBoard(owner.id, "Owner roadmap", "owner-roadmap");
      await createNamedBoard(otherUser.id, "Other roadmap", "other-roadmap");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner agent",
        scopes: [ApiTokenScope.BOARDS_READ],
      });

      const response = await getBoards(
        externalGetRequest("/api/external/v1/boards", token),
      );
      const body = await expectJsonContract(response, externalBoardsResponseSchema);
      const boardNames = body.data.boards.map((board) => board.name);
      const log = structuredLog();

      expect(boardNames).toEqual(["Owner roadmap"]);
      expect(boardNames).not.toContain(starterBoard.name);
      expect(boardNames).not.toContain("Other roadmap");
      expect(log.userId).toBe(owner.id);
    });

    test("GET /api/external/v1/boards rejects DB tokens without the required scope", async () => {
      const { token } = await createApiToken({
        createdById: demoUser.id,
        label: "Tasks-only consumer",
        scopes: [ApiTokenScope.TASKS_READ],
      });

      const response = await getBoards(
        externalGetRequest("/api/external/v1/boards", token),
      );
      const body = await response.json();
      const log = structuredLog();

      expect(response.status).toBe(403);
      expect(body).toEqual({
        error: "Insufficient token scope: requires BOARDS_READ.",
        ok: false,
      });
      expect(log.outcome).toBe("auth_failed");
      expect(log.userId).toBe(demoUser.id);
    });

    test("GET /api/external/v1/dashboard touches lastUsedAt for DB tokens", async () => {
      const { apiToken, token } = await createApiToken({
        createdById: demoUser.id,
        label: "Usage tracked consumer",
        scopes: defaultReadApiTokenScopes,
      });

      const response = await getDashboard(
        externalGetRequest("/api/external/v1/dashboard", token),
      );
      const row = await prisma.apiToken.findUniqueOrThrow({
        where: { id: apiToken.id },
        select: { lastUsedAt: true },
      });

      await expectJsonContract(response, externalDashboardResponseSchema);
      expect(row.lastUsedAt).toBeInstanceOf(Date);
    });

    test("GET /api/external/v1/dashboard rejects revoked DB tokens", async () => {
      const { apiToken, token } = await createApiToken({
        createdById: demoUser.id,
        label: "Revoked consumer",
        scopes: defaultReadApiTokenScopes,
      });
      await revokeApiToken(apiToken.id);

      const response = await getDashboard(
        externalGetRequest("/api/external/v1/dashboard", token),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Invalid API key.",
        ok: false,
      });
    });

    test("GET /api/external/v1/dashboard still accepts the env API key", async () => {
      const response = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));

      await expectJsonContract(response, externalDashboardResponseSchema);
    });

    test("POST /api/external/v1/tasks creates a task for the token owner", async () => {
      const owner = await createTestUser({
        email: "task-create-owner@example.test",
        name: "Task Create Owner",
      });
      const board = await createNamedBoard(owner.id, "Owner write board", "owner-write");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner task writer",
        scopes: [ApiTokenScope.TASKS_WRITE],
      });

      const response = await postTask(
        externalJsonRequest(
          "POST",
          "/api/external/v1/tasks",
          {
            boardSlug: board.slug,
            description: "Created externally",
            dueDate: "2026-07-04",
            priority: "HIGH",
            recurrence: "NONE",
            status: "ON_DECK",
            title: "Created from external API",
          },
          token,
        ),
      );
      const body = await expectJsonContract(
        response,
        externalTaskResponseSchema,
        201,
      );
      const task = await prisma.task.findFirst({
        where: { id: body.data.id, board: { userId: owner.id } },
      });

      expect(body.data.title).toBe("Created from external API");
      expect(task).toMatchObject({
        boardId: board.id,
        description: "Created externally",
        priority: PrismaItemPriority.HIGH,
        status: PrismaTaskStatus.ON_DECK,
        title: "Created from external API",
      });
    });

    test("PATCH /api/external/v1/tasks/[id] updates scalar fields without deleting subtasks", async () => {
      const owner = await createTestUser({
        email: "task-update-owner@example.test",
        name: "Task Update Owner",
      });
      const board = await createNamedBoard(owner.id, "Owner patch board", "owner-patch");
      const task = await createRouteTask(board.id, "Patch me");
      await prisma.subtask.createMany({
        data: [
          {
            id: randomUUID(),
            isComplete: false,
            sortOrder: 0,
            taskId: task.id,
            title: "First preserved subtask",
          },
          {
            id: randomUUID(),
            isComplete: true,
            sortOrder: 1,
            taskId: task.id,
            title: "Second preserved subtask",
          },
        ],
      });
      const before = await prisma.subtask.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, isComplete: true, sortOrder: true, title: true },
        where: { taskId: task.id },
      });
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner task patcher",
        scopes: [ApiTokenScope.TASKS_WRITE],
      });

      const response = await patchTask(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/tasks/${task.id}`,
          { status: "DONE" },
          token,
        ),
        { params: Promise.resolve({ id: task.id }) },
      );
      const body = await expectJsonContract(response, externalTaskResponseSchema);
      const after = await prisma.subtask.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, isComplete: true, sortOrder: true, title: true },
        where: { taskId: task.id },
      });

      expect(body.data.status).toBe("DONE");
      expect(after).toEqual(before);
      expect(body.data.subtasks.map((subtask) => subtask.title)).toEqual([
        "First preserved subtask",
        "Second preserved subtask",
      ]);
    });

    test("DELETE /api/external/v1/tasks/[id] deletes a task for the token owner", async () => {
      const owner = await createTestUser({
        email: "task-delete-owner@example.test",
        name: "Task Delete Owner",
      });
      const board = await createNamedBoard(owner.id, "Owner delete board", "owner-delete");
      const task = await createRouteTask(board.id, "Delete me");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner task deleter",
        scopes: [ApiTokenScope.TASKS_WRITE],
      });

      const response = await deleteTask(
        externalDeleteRequest(`/api/external/v1/tasks/${task.id}`, token),
        { params: Promise.resolve({ id: task.id }) },
      );
      const deleted = await prisma.task.findUnique({ where: { id: task.id } });

      await expectJsonContract(response, externalOkResponseSchema);
      expect(deleted).toBeNull();
    });

    test("TASKS_WRITE tokens cannot update or delete another user's task", async () => {
      const owner = await createTestUser({
        email: "task-isolation-owner@example.test",
        name: "Task Isolation Owner",
      });
      const otherUser = await createTestUser({
        email: "task-isolation-other@example.test",
        name: "Task Isolation Other",
      });
      const ownerBoard = await createNamedBoard(owner.id, "Owner isolated board", "owner-isolated");
      const otherBoard = await createNamedBoard(otherUser.id, "Other isolated board", "other-isolated");
      const otherTask = await createRouteTask(otherBoard.id, "Other user's task");
      await createRouteTask(ownerBoard.id, "Owner task");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner isolated writer",
        scopes: [ApiTokenScope.TASKS_WRITE],
      });

      const updateResponse = await patchTask(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/tasks/${otherTask.id}`,
          { title: "Stolen task" },
          token,
        ),
        { params: Promise.resolve({ id: otherTask.id }) },
      );
      const afterUpdate = await prisma.task.findUniqueOrThrow({
        where: { id: otherTask.id },
      });
      const deleteResponse = await deleteTask(
        externalDeleteRequest(`/api/external/v1/tasks/${otherTask.id}`, token),
        { params: Promise.resolve({ id: otherTask.id }) },
      );
      const afterDelete = await prisma.task.findUnique({ where: { id: otherTask.id } });

      expect(updateResponse.status).toBe(404);
      expect(afterUpdate).toMatchObject({
        status: PrismaTaskStatus.IN_PROGRESS,
        title: "Other user's task",
      });
      expect(deleteResponse.status).toBe(404);
      expect(afterDelete).not.toBeNull();
    });

    test("write routes reject DB tokens without TASKS_WRITE", async () => {
      const owner = await createTestUser({
        email: "task-scope-owner@example.test",
        name: "Task Scope Owner",
      });
      const board = await createNamedBoard(owner.id, "Owner scope board", "owner-scope");
      const task = await createRouteTask(board.id, "Scoped task");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Read-only task consumer",
        scopes: [ApiTokenScope.TASKS_READ],
      });

      const createResponse = await postTask(
        externalJsonRequest(
          "POST",
          "/api/external/v1/tasks",
          { boardSlug: board.slug, title: "Forbidden create" },
          token,
        ),
      );
      const updateResponse = await patchTask(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/tasks/${task.id}`,
          { title: "Forbidden update" },
          token,
        ),
        { params: Promise.resolve({ id: task.id }) },
      );
      const deleteResponse = await deleteTask(
        externalDeleteRequest(`/api/external/v1/tasks/${task.id}`, token),
        { params: Promise.resolve({ id: task.id }) },
      );
      const afterDeniedWrites = await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
      });

      expect(createResponse.status).toBe(403);
      expect(updateResponse.status).toBe(403);
      expect(deleteResponse.status).toBe(403);
      expect(afterDeniedWrites.title).toBe("Scoped task");
    });

    test("write routes reject malformed and empty request bodies", async () => {
      const owner = await createTestUser({
        email: "task-validation-owner@example.test",
        name: "Task Validation Owner",
      });
      const board = await createNamedBoard(owner.id, "Owner validation board", "owner-validation");
      const task = await createRouteTask(board.id, "Validate me");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner validation writer",
        scopes: [ApiTokenScope.TASKS_WRITE],
      });

      const malformedCreate = await postTask(
        externalRawJsonRequest("POST", "/api/external/v1/tasks", "{", token),
      );
      const emptyPatch = await patchTask(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/tasks/${task.id}`,
          {},
          token,
        ),
        { params: Promise.resolve({ id: task.id }) },
      );

      expect(malformedCreate.status).toBe(400);
      await expect(malformedCreate.json()).resolves.toEqual({
        error: "Invalid JSON body.",
        ok: false,
      });
      expect(emptyPatch.status).toBe(400);
      await expect(emptyPatch.json()).resolves.toEqual({
        error: "Provide at least one field to update.",
        ok: false,
      });
    });

    test("POST /api/external/v1/boards creates a board with an auto-generated slug", async () => {
      const owner = await createTestUser({
        email: "board-create-owner@example.test",
        name: "Board Create Owner",
      });
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner board creator",
        scopes: [ApiTokenScope.BOARDS_WRITE],
      });

      const response = await postBoard(
        externalJsonRequest(
          "POST",
          "/api/external/v1/boards",
          {
            accentColor: "#2f9f85",
            description: "Created externally",
            iconKey: "rocket",
            name: "My New Board",
          },
          token,
        ),
      );
      const body = await expectJsonContract(
        response,
        externalBoardWriteResponseSchema,
        201,
      );
      const board = await prisma.board.findFirst({
        where: { slug: "my-new-board", userId: owner.id },
      });

      expect(body.data).toMatchObject({
        accentColor: "#2f9f85",
        iconKey: "rocket",
        name: "My New Board",
        slug: "my-new-board",
      });
      expect(board).toMatchObject({
        description: "Created externally",
        name: "My New Board",
        slug: "my-new-board",
      });
    });

    test("PATCH /api/external/v1/boards/[slug] updates a board for the token owner", async () => {
      const owner = await createTestUser({
        email: "board-update-owner@example.test",
        name: "Board Update Owner",
      });
      const board = await createNamedBoard(owner.id, "Board to update", "board-update");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner board updater",
        scopes: [ApiTokenScope.BOARDS_WRITE],
      });

      const response = await patchBoard(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/boards/${board.slug}`,
          {
            accentColor: "#c94f7c",
            description: "Updated externally",
            iconKey: "target",
            name: "Updated Board",
          },
          token,
        ),
        { params: Promise.resolve({ slug: board.slug }) },
      );
      const body = await expectJsonContract(
        response,
        externalBoardWriteResponseSchema,
      );
      const previousSlug = await prisma.board.findFirst({
        where: { slug: board.slug, userId: owner.id },
      });
      const updated = await prisma.board.findFirst({
        where: { slug: "updated-board", userId: owner.id },
      });

      expect(body.data).toMatchObject({
        accentColor: "#c94f7c",
        iconKey: "target",
        name: "Updated Board",
        slug: "updated-board",
      });
      expect(previousSlug).toBeNull();
      expect(updated).toMatchObject({
        description: "Updated externally",
        name: "Updated Board",
      });
    });

    test("DELETE /api/external/v1/boards/[slug] deletes a board for the token owner", async () => {
      const owner = await createTestUser({
        email: "board-delete-owner@example.test",
        name: "Board Delete Owner",
      });
      const board = await createNamedBoard(owner.id, "Board to delete", "board-delete");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner board deleter",
        scopes: [ApiTokenScope.BOARDS_WRITE],
      });

      const response = await deleteBoard(
        externalDeleteRequest(`/api/external/v1/boards/${board.slug}`, token),
        { params: Promise.resolve({ slug: board.slug }) },
      );
      const deleted = await prisma.board.findUnique({ where: { id: board.id } });

      await expectJsonContract(response, externalOkResponseSchema);
      expect(deleted).toBeNull();
    });

    test("PATCH /api/external/v1/boards/[slug]/note updates a board note", async () => {
      const owner = await createTestUser({
        email: "board-note-owner@example.test",
        name: "Board Note Owner",
      });
      const board = await createNamedBoard(owner.id, "Board note", "board-note");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner board note writer",
        scopes: [ApiTokenScope.BOARDS_WRITE],
      });

      const response = await patchBoardNote(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/boards/${board.slug}/note`,
          { content: "Updated from the external API." },
          token,
        ),
        { params: Promise.resolve({ slug: board.slug }) },
      );
      const note = await prisma.boardNote.findUnique({
        where: { boardId: board.id },
      });

      await expectJsonContract(response, externalOkResponseSchema);
      expect(note?.content).toBe("Updated from the external API.");
    });

    test("subtask write routes create, update, and delete subtasks on the parent task", async () => {
      const owner = await createTestUser({
        email: "subtask-lifecycle-owner@example.test",
        name: "Subtask Lifecycle Owner",
      });
      const board = await createNamedBoard(owner.id, "Subtask board", "subtask-board");
      const task = await createRouteTask(board.id, "Parent task");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner subtask writer",
        scopes: [ApiTokenScope.SUBTASKS_WRITE],
      });

      const createResponse = await postSubtask(
        externalJsonRequest(
          "POST",
          `/api/external/v1/tasks/${task.id}/subtasks`,
          { title: "Created subtask" },
          token,
        ),
        { params: Promise.resolve({ id: task.id }) },
      );
      const createdBody = await expectJsonContract(
        createResponse,
        externalTaskResponseSchema,
        201,
      );
      const createdSubtask = createdBody.data.subtasks.find(
        (subtask) => subtask.title === "Created subtask",
      );

      if (!createdSubtask) {
        throw new Error("Expected subtask create response to include the new subtask.");
      }

      const updateResponse = await patchSubtask(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/subtasks/${createdSubtask.id}`,
          { isComplete: true, title: "Updated subtask" },
          token,
        ),
        { params: Promise.resolve({ id: createdSubtask.id }) },
      );
      const updatedBody = await expectJsonContract(
        updateResponse,
        externalTaskResponseSchema,
      );
      const updatedSubtask = updatedBody.data.subtasks.find(
        (subtask) => subtask.id === createdSubtask.id,
      );

      expect(createdBody.data.id).toBe(task.id);
      expect(createdSubtask.isComplete).toBe(false);
      expect(updatedBody.data.id).toBe(task.id);
      expect(updatedSubtask).toMatchObject({
        isComplete: true,
        title: "Updated subtask",
      });

      const deleteResponse = await deleteSubtask(
        externalDeleteRequest(
          `/api/external/v1/subtasks/${createdSubtask.id}`,
          token,
        ),
        { params: Promise.resolve({ id: createdSubtask.id }) },
      );
      const deletedBody = await expectJsonContract(
        deleteResponse,
        externalTaskResponseSchema,
      );
      const deleted = await prisma.subtask.findUnique({
        where: { id: createdSubtask.id },
      });

      expect(deletedBody.data.id).toBe(task.id);
      expect(deletedBody.data.subtasks.map((subtask) => subtask.id)).not.toContain(
        createdSubtask.id,
      );
      expect(deleted).toBeNull();
    });

    test("BOARDS_WRITE tokens cannot update or delete another user's board", async () => {
      const owner = await createTestUser({
        email: "board-isolation-owner@example.test",
        name: "Board Isolation Owner",
      });
      const otherUser = await createTestUser({
        email: "board-isolation-other@example.test",
        name: "Board Isolation Other",
      });
      await createNamedBoard(owner.id, "Owner board", "owner-board");
      const otherBoard = await createNamedBoard(
        otherUser.id,
        "Other user's board",
        "other-board",
      );
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner board isolator",
        scopes: [ApiTokenScope.BOARDS_WRITE],
      });

      const updateResponse = await patchBoard(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/boards/${otherBoard.slug}`,
          { name: "Stolen board" },
          token,
        ),
        { params: Promise.resolve({ slug: otherBoard.slug }) },
      );
      const afterUpdate = await prisma.board.findUniqueOrThrow({
        where: { id: otherBoard.id },
      });
      const deleteResponse = await deleteBoard(
        externalDeleteRequest(
          `/api/external/v1/boards/${otherBoard.slug}`,
          token,
        ),
        { params: Promise.resolve({ slug: otherBoard.slug }) },
      );
      const afterDelete = await prisma.board.findUnique({
        where: { id: otherBoard.id },
      });

      expect(updateResponse.status).toBe(404);
      expect(afterUpdate).toMatchObject({
        name: "Other user's board",
        slug: "other-board",
      });
      expect(deleteResponse.status).toBe(404);
      expect(afterDelete).not.toBeNull();
    });

    test("SUBTASKS_WRITE tokens cannot update or delete another user's subtask", async () => {
      const owner = await createTestUser({
        email: "subtask-isolation-owner@example.test",
        name: "Subtask Isolation Owner",
      });
      const otherUser = await createTestUser({
        email: "subtask-isolation-other@example.test",
        name: "Subtask Isolation Other",
      });
      const ownerBoard = await createNamedBoard(owner.id, "Owner subtask board", "owner-subtask");
      const otherBoard = await createNamedBoard(otherUser.id, "Other subtask board", "other-subtask");
      await createRouteTask(ownerBoard.id, "Owner task");
      const otherTask = await createRouteTask(otherBoard.id, "Other task");
      const otherSubtask = await createRouteSubtask(
        otherTask.id,
        "Other user's subtask",
      );
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner subtask isolator",
        scopes: [ApiTokenScope.SUBTASKS_WRITE],
      });

      const updateResponse = await patchSubtask(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/subtasks/${otherSubtask.id}`,
          { title: "Stolen subtask" },
          token,
        ),
        { params: Promise.resolve({ id: otherSubtask.id }) },
      );
      const afterUpdate = await prisma.subtask.findUniqueOrThrow({
        where: { id: otherSubtask.id },
      });
      const deleteResponse = await deleteSubtask(
        externalDeleteRequest(
          `/api/external/v1/subtasks/${otherSubtask.id}`,
          token,
        ),
        { params: Promise.resolve({ id: otherSubtask.id }) },
      );
      const afterDelete = await prisma.subtask.findUnique({
        where: { id: otherSubtask.id },
      });

      expect(updateResponse.status).toBe(404);
      expect(afterUpdate).toMatchObject({
        isComplete: false,
        title: "Other user's subtask",
      });
      expect(deleteResponse.status).toBe(404);
      expect(afterDelete).not.toBeNull();
    });

    test("board write routes reject DB tokens without BOARDS_WRITE", async () => {
      const owner = await createTestUser({
        email: "board-scope-owner@example.test",
        name: "Board Scope Owner",
      });
      const board = await createNamedBoard(owner.id, "Board scope", "board-scope");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Subtasks-only consumer",
        scopes: [ApiTokenScope.SUBTASKS_WRITE],
      });

      const createResponse = await postBoard(
        externalJsonRequest(
          "POST",
          "/api/external/v1/boards",
          { name: "Forbidden board" },
          token,
        ),
      );
      const updateResponse = await patchBoard(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/boards/${board.slug}`,
          { name: "Forbidden update" },
          token,
        ),
        { params: Promise.resolve({ slug: board.slug }) },
      );
      const deleteResponse = await deleteBoard(
        externalDeleteRequest(`/api/external/v1/boards/${board.slug}`, token),
        { params: Promise.resolve({ slug: board.slug }) },
      );
      const noteResponse = await patchBoardNote(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/boards/${board.slug}/note`,
          { content: "Forbidden note" },
          token,
        ),
        { params: Promise.resolve({ slug: board.slug }) },
      );
      const afterDeniedWrites = await prisma.board.findUniqueOrThrow({
        where: { id: board.id },
      });

      expect(createResponse.status).toBe(403);
      expect(updateResponse.status).toBe(403);
      expect(deleteResponse.status).toBe(403);
      expect(noteResponse.status).toBe(403);
      expect(afterDeniedWrites.name).toBe("Board scope");
    });

    test("subtask write routes reject DB tokens without SUBTASKS_WRITE", async () => {
      const owner = await createTestUser({
        email: "subtask-scope-owner@example.test",
        name: "Subtask Scope Owner",
      });
      const board = await createNamedBoard(owner.id, "Subtask scope", "subtask-scope");
      const task = await createRouteTask(board.id, "Scoped parent");
      const subtask = await createRouteSubtask(task.id, "Scoped subtask");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Boards-only consumer",
        scopes: [ApiTokenScope.BOARDS_WRITE],
      });

      const createResponse = await postSubtask(
        externalJsonRequest(
          "POST",
          `/api/external/v1/tasks/${task.id}/subtasks`,
          { title: "Forbidden subtask" },
          token,
        ),
        { params: Promise.resolve({ id: task.id }) },
      );
      const updateResponse = await patchSubtask(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/subtasks/${subtask.id}`,
          { title: "Forbidden update" },
          token,
        ),
        { params: Promise.resolve({ id: subtask.id }) },
      );
      const deleteResponse = await deleteSubtask(
        externalDeleteRequest(`/api/external/v1/subtasks/${subtask.id}`, token),
        { params: Promise.resolve({ id: subtask.id }) },
      );
      const afterDeniedWrites = await prisma.subtask.findUniqueOrThrow({
        where: { id: subtask.id },
      });

      expect(createResponse.status).toBe(403);
      expect(updateResponse.status).toBe(403);
      expect(deleteResponse.status).toBe(403);
      expect(afterDeniedWrites.title).toBe("Scoped subtask");
    });

    test("board and subtask write routes reject malformed and empty request bodies", async () => {
      const owner = await createTestUser({
        email: "board-subtask-validation-owner@example.test",
        name: "Board Subtask Validation Owner",
      });
      const board = await createNamedBoard(owner.id, "Validation board", "validation-board");
      const task = await createRouteTask(board.id, "Validation parent");
      const subtask = await createRouteSubtask(task.id, "Validation subtask");
      const { token } = await createApiToken({
        createdById: owner.id,
        label: "Owner board and subtask writer",
        scopes: [ApiTokenScope.BOARDS_WRITE, ApiTokenScope.SUBTASKS_WRITE],
      });

      const malformedBoardCreate = await postBoard(
        externalRawJsonRequest("POST", "/api/external/v1/boards", "{", token),
      );
      const emptyBoardPatch = await patchBoard(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/boards/${board.slug}`,
          {},
          token,
        ),
        { params: Promise.resolve({ slug: board.slug }) },
      );
      const emptyNotePatch = await patchBoardNote(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/boards/${board.slug}/note`,
          {},
          token,
        ),
        { params: Promise.resolve({ slug: board.slug }) },
      );
      const malformedSubtaskCreate = await postSubtask(
        externalRawJsonRequest(
          "POST",
          `/api/external/v1/tasks/${task.id}/subtasks`,
          "{",
          token,
        ),
        { params: Promise.resolve({ id: task.id }) },
      );
      const emptySubtaskPatch = await patchSubtask(
        externalJsonRequest(
          "PATCH",
          `/api/external/v1/subtasks/${subtask.id}`,
          {},
          token,
        ),
        { params: Promise.resolve({ id: subtask.id }) },
      );

      expect(malformedBoardCreate.status).toBe(400);
      await expect(malformedBoardCreate.json()).resolves.toEqual({
        error: "Invalid JSON body.",
        ok: false,
      });
      expect(emptyBoardPatch.status).toBe(400);
      expect(emptyNotePatch.status).toBe(400);
      expect(malformedSubtaskCreate.status).toBe(400);
      await expect(malformedSubtaskCreate.json()).resolves.toEqual({
        error: "Invalid JSON body.",
        ok: false,
      });
      expect(emptySubtaskPatch.status).toBe(400);
    });
  });

  test("legacy env API key returns EXTERNAL_USER_ID data on all external read routes", async () => {
    const otherUser = await createTestUser({
      email: "legacy-other@example.test",
      name: "Legacy Other",
    });
    const otherBoard = await createNamedBoard(otherUser.id, "Other private board", "other-private");
    await createRouteTask(otherBoard.id, "Other private task");

    const dashboard = await expectJsonContract(
      await getDashboard(externalGetRequest("/api/external/v1/dashboard")),
      externalDashboardResponseSchema,
    );
    const boards = await expectJsonContract(
      await getBoards(externalGetRequest("/api/external/v1/boards")),
      externalBoardsResponseSchema,
    );
    const board = await expectJsonContract(
      await getBoard(externalGetRequest("/api/external/v1/boards/personal"), {
        params: Promise.resolve({ slug: "personal" }),
      }),
      externalBoardResponseSchema,
    );
    const dailySummary = await expectJsonContract(
      await getDailySummary(externalGetRequest("/api/external/v1/daily-summary")),
      externalDailySummaryResponseSchema,
    );

    expect(dashboard.data.totalTaskCount).toBe(3);
    expect(dashboard.data.boardBreakdown.map((item) => item.name)).toEqual([
      starterBoard.name,
    ]);
    expect(boards.data.boards.map((item) => item.name)).toEqual([starterBoard.name]);
    expect(board.data.name).toBe(starterBoard.name);
    expect(board.data.tasks.map((task) => task.title)).not.toContain("Other private task");

    const summaryTitles = [
      ...dailySummary.inProgress,
      ...dailySummary.onDeck,
      ...dailySummary.iceBox,
      ...dailySummary.recentlyCompleted,
    ].map((task) => task.title);

    expect(summaryTitles).toContain("Prepare launch notes");
    expect(summaryTitles).not.toContain("Other private task");
  });

  test("GET /api/external/v1/dashboard returns a request ID matching the structured log", async () => {
    const response = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const requestId = response.headers.get("X-Request-Id");
    const log = structuredLog();

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(requestId).toMatch(uuidV4Pattern);
    expect(log.kind).toBe("external_api_request");
    expect(log.requestId).toBe(requestId);
    expect(log.route).toBe("/api/external/v1/dashboard");
    expect(log.method).toBe("GET");
    expect(log.status).toBe(200);
    expect(Number.isInteger(log.durationMs)).toBe(true);
    expect(log.outcome).toBe("ok");
  });

  test("withExternalApiObservability returns a 500 NextResponse with X-Request-Id when the handler throws", async () => {
    consoleErrorSpy.mockImplementation(() => {});

    const response = await withExternalApiObservability(
      externalGetRequest("/api/external/v1/dashboard"),
      "/api/external/v1/dashboard",
      async () => {
        throw new Error("simulated handler failure");
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Request-Id")).toMatch(uuidV4Pattern);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(response.headers.get("X-RateLimit-Remaining")).toMatch(/^\d+$/);
    expect(response.headers.get("X-RateLimit-Reset")).toMatch(/^\d+$/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("X-Internal-Outcome")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error.",
      ok: false,
    });

    const log = structuredLog();
    expect(log.outcome).toBe("server_error");
    expect(log.status).toBe(500);
    expect(log.requestId).toBe(response.headers.get("X-Request-Id"));
  });

  test("withExternalApiObservability calls Sentry.captureException on uncaught throws", async () => {
    consoleErrorSpy.mockImplementation(() => {});

    await withExternalApiObservability(
      externalGetRequest("/api/external/v1/dashboard"),
      "/api/external/v1/dashboard",
      async () => {
        throw new Error("simulated handler failure");
      },
    );

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  test("withExternalApiObservability still returns a 500 NextResponse when Sentry capture itself throws", async () => {
    consoleErrorSpy.mockImplementation(() => {});
    sentryMock.captureException.mockImplementation(() => {
      throw new Error("Sentry exploded");
    });

    const response = await withExternalApiObservability(
      externalGetRequest("/api/external/v1/dashboard"),
      "/api/external/v1/dashboard",
      async () => {
        throw new Error("simulated handler failure");
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Request-Id")).toMatch(uuidV4Pattern);
  });

  test("GET /api/external/v1/dashboard returns a fresh request ID per request", async () => {
    const first = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const second = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const firstRequestId = first.headers.get("X-Request-Id");
    const secondRequestId = second.headers.get("X-Request-Id");

    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    expect(firstRequestId).toMatch(uuidV4Pattern);
    expect(secondRequestId).toMatch(uuidV4Pattern);
    expect(firstRequestId).not.toBe(secondRequestId);
  });

  test("GET /api/external/v1/dashboard logs auth failure without a bearer token", async () => {
    const response = await getDashboard(
      externalGetRequestWithoutAuthorization("/api/external/v1/dashboard"),
    );
    const requestId = response.headers.get("X-Request-Id");
    const log = structuredLog();

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
    expect(requestId).toMatch(uuidV4Pattern);
    expect(log.requestId).toBe(requestId);
    expect(log.outcome).toBe("auth_failed");
    expect(log.apiKeyPrefix).toBeNull();
  });

  test("GET /api/external/v1/dashboard logs auth failure with only an API key prefix", async () => {
    const token = "wrong-key-1234567890";
    const response = await getDashboard(
      externalGetRequest("/api/external/v1/dashboard", token),
    );
    const log = structuredLog();

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(403);
    expect(log.outcome).toBe("auth_failed");
    expect(log.apiKeyPrefix).toBe("wrong-ke");
    expect(structuredLogLine()).not.toContain(token);
  });

  test("external API structured logs are parseable and omit API key secrets", async () => {
    const configuredKey = process.env.EXTERNAL_API_KEY ?? "";
    const token = configuredKey;

    expect(token).not.toBe("");

    await getDashboard(externalGetRequest("/api/external/v1/dashboard", token));

    const logged = structuredLogLine();
    const log = structuredLog();

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(log.kind).toBe("external_api_request");
    expect(log.apiKeyPrefix).toBe(token.slice(0, 8));
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(configuredKey);
  });

  test("GET /api/external/v1/dashboard logs the resolved auth user", async () => {
    // tokenMatchesAny is module-private and timingSafeEqual is imported as a
    // named binding during module evaluation, so vi.spyOn cannot reliably
    // observe the call count here. This guards the observable threading result.
    const response = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));
    const log = structuredLog();

    expect(response.status).toBe(200);
    expect(log.userId).toBe(process.env.EXTERNAL_USER_ID?.trim() || demoUser.id);
  });

  test("X-Internal-Outcome is not returned on success or validation failure", async () => {
    const success = await getDashboard(externalGetRequest("/api/external/v1/dashboard"));

    expect(success.headers.get("X-Internal-Outcome")).toBeNull();

    consoleLogSpy.mockClear();

    const validationSchema: ZodType<{ ok: true }> = z.object({
      ok: z.literal(true),
    });
    const validationFailure = await withExternalApiObservability(
      externalGetRequest("/api/external/v1/dashboard"),
      "/api/external/v1/dashboard",
      async ({ requestId }) =>
        externalApiJson(
          validationSchema,
          { ok: false } as unknown as { ok: true },
          undefined,
          requestId,
        ),
    );
    const requestId = validationFailure.headers.get("X-Request-Id");
    const log = structuredLog();

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(validationFailure.status).toBe(500);
    expect(requestId).toMatch(uuidV4Pattern);
    expect(validationFailure.headers.get("X-Internal-Outcome")).toBeNull();
    expect(log.requestId).toBe(requestId);
    expect(log.outcome).toBe("validation_failed");
  });
});
