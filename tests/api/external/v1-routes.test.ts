import {
  ApiTokenScope,
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z, type ZodType } from "zod";

import { GET as getBoard } from "@/app/api/external/v1/boards/[slug]/route";
import { GET as getBoards } from "@/app/api/external/v1/boards/route";
import { GET as getDailySummary } from "@/app/api/external/v1/daily-summary/route";
import { GET as getDashboard } from "@/app/api/external/v1/dashboard/route";
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
  externalBoardsResponseSchema,
  externalDailySummaryResponseSchema,
  externalDashboardResponseSchema,
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

async function expectJsonContract<T>(response: Response, schema: ZodType<T>) {
  const body = await response.json();
  const parsed = schema.safeParse(body);

  expect(response.status).toBe(200);
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
