import {
  ApiTokenScope,
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createApiToken } from "@/lib/data";
import { prisma } from "@/lib/db";
import { demoUser } from "@/lib/domain";
import {
  buildExternalDailySummary,
  checkExternalApiRateLimit,
  type ExternalApiContext,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  createTestBoard,
  createTestUser,
  resetDatabase,
} from "../helpers/database";

const externalRateLimit = 120;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

type MockSentryScope = {
  setContext(name: string, context: Record<string, unknown>): void;
  setTag(name: string, value: string): void;
};

function externalRequest(authorization: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL("/api/external/v1/test", origin), {
    headers: { authorization },
    method: "GET",
  });
}

function restoreEnvironmentVariable(
  name: "EXTERNAL_API_KEY" | "EXTERNAL_USER_ID",
  value: string | undefined,
) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

async function withSentryModule<T>(
  moduleShape: Record<string, unknown>,
  callback: (externalApi: typeof import("@/lib/external-api")) => Promise<T>,
) {
  vi.resetModules();
  vi.doMock("@sentry/nextjs", () => moduleShape);

  try {
    return await callback(await import("@/lib/external-api"));
  } finally {
    vi.doUnmock("@sentry/nextjs");
    vi.resetModules();
  }
}

function requestWithInitialHeaderFailure(error: Error) {
  const request = externalRequest(`Bearer ${process.env.EXTERNAL_API_KEY ?? ""}`);
  let headerReads = 0;

  return {
    get headers() {
      headerReads += 1;

      if (headerReads === 1) {
        throw error;
      }

      return request.headers;
    },
    method: request.method,
  } as Request;
}

async function expectExternalApiError(
  response: Awaited<ReturnType<typeof withExternalApiObservability>>,
  status: number,
  error: string,
) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ error, ok: false });

  return response;
}

describe("external API auth, rate limiting, and summaries", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("rejects malformed Authorization headers", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    for (const authorization of ["NotBearer xyz", "Bearer    "]) {
      const response = await expectExternalApiError(
        await withExternalApiObservability(
          externalRequest(authorization),
          "/api/external/v1/test",
          handler,
          { rateLimitScope: "external-api-malformed-test" },
        ),
        401,
        "Malformed Authorization header.",
      );

      expect(response.headers.get("WWW-Authenticate")).toBe(
        'Bearer realm="external-api"',
      );
    }

    expect(handler).not.toHaveBeenCalled();
  });

  test("returns 503 when the legacy API key is not configured", async () => {
    const originalApiKey = process.env.EXTERNAL_API_KEY;
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    try {
      delete process.env.EXTERNAL_API_KEY;

      await expectExternalApiError(
        await withExternalApiObservability(
          externalRequest("Bearer any-token"),
          "/api/external/v1/test",
          handler,
          { rateLimitScope: "external-api-unconfigured-test" },
        ),
        503,
        "External API is not configured.",
      );
      expect(handler).not.toHaveBeenCalled();
    } finally {
      restoreEnvironmentVariable("EXTERNAL_API_KEY", originalApiKey);
    }
  });

  test("requires the legacy API user to exist by default", async () => {
    const originalUserId = process.env.EXTERNAL_USER_ID;
    const apiKey = process.env.EXTERNAL_API_KEY;

    if (!apiKey) {
      throw new Error("Expected EXTERNAL_API_KEY to be configured for tests.");
    }

    try {
      process.env.EXTERNAL_USER_ID = randomUUID();

      const response = await withExternalApiObservability(
        externalRequest(`Bearer ${apiKey}`),
        "/api/external/v1/test",
        async ({ user }) => NextResponse.json({ userId: user.userId }),
        { requiredScope: ApiTokenScope.TASKS_READ },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "External API user was not found.",
        ok: false,
      });
    } finally {
      restoreEnvironmentVariable("EXTERNAL_USER_ID", originalUserId);
    }
  });

  test("returns a real 429 after exhausting the external API rate limit", async () => {
    const request = externalRequest("Bearer rate-limit-test-token");

    for (let count = 0; count < externalRateLimit; count += 1) {
      const result = await checkExternalApiRateLimit(request, "external-api");

      expect(result.kind).toBe("ok");
    }

    const result = await checkExternalApiRateLimit(request, "external-api");

    expect(result.kind).toBe("limited");
    if (result.kind !== "limited") {
      throw new Error("Expected the external API rate limit to be exhausted.");
    }

    expect(result.response.status).toBe(429);
    expect(result.response.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    await expect(result.response.json()).resolves.toEqual({
      message: "Too many attempts. Please try again shortly.",
    });

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const response = await withExternalApiObservability(
      request,
      "/api/external/v1/test",
      handler,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    await expect(response.json()).resolves.toEqual({
      message: "Too many attempts. Please try again shortly.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  test("adapts Sentry's default export and finalizes errors without rate-limit headers", async () => {
    const captureException = vi.fn();
    const scope = { setContext: vi.fn(), setTag: vi.fn() };
    const withScope = vi.fn((callback: (scope: MockSentryScope) => void) => callback(scope));
    const initialError = new Error("rate-limit request inspection failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await withSentryModule(
        {
          captureException: undefined,
          default: { captureException, withScope },
          withScope: undefined,
        },
        async ({ withExternalApiObservability: withObservability }) => {
          const handler = vi.fn(async () => NextResponse.json({ ok: true }));
          const response = await withObservability(
            requestWithInitialHeaderFailure(initialError),
            "/api/external/v1/test",
            handler,
          );

          expect(response.status).toBe(500);
          expect(response.headers.get("X-Request-Id")).toEqual(expect.any(String));
          expect(response.headers.get("X-RateLimit-Limit")).toBeNull();
          expect(handler).not.toHaveBeenCalled();
        },
      );

      expect(withScope).toHaveBeenCalledOnce();
      expect(captureException).toHaveBeenCalledWith(initialError);
    } finally {
      consoleError.mockRestore();
      consoleLog.mockRestore();
    }
  });

  test("continues when the Sentry capture API is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await withSentryModule(
        { captureException: undefined, default: undefined, withScope: undefined },
        async ({ withExternalApiObservability: withObservability }) => {
          const response = await withObservability(
            requestWithInitialHeaderFailure(new Error("request inspection failed")),
            "/api/external/v1/test",
            async () => NextResponse.json({ ok: true }),
          );

          expect(response.status).toBe(500);
          expect(response.headers.get("X-Request-Id")).toEqual(expect.any(String));
        },
      );

      expect(consoleError).toHaveBeenCalledWith(
        "Sentry capture failed for external API throw.",
        expect.objectContaining({ message: "Sentry capture API is unavailable." }),
      );
    } finally {
      consoleError.mockRestore();
      consoleLog.mockRestore();
    }
  });

  test("maps handler 429 responses to the rate-limited outcome", async () => {
    await createTestUser({
      email: demoUser.email,
      id: demoUser.id,
      name: demoUser.name,
    });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const response = await withExternalApiObservability(
        externalRequest(`Bearer ${process.env.EXTERNAL_API_KEY ?? ""}`),
        "/api/external/v1/test",
        async () => NextResponse.json({ ok: false }, { status: 429 }),
      );
      const log = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as { outcome: string };

      expect(response.status).toBe(429);
      expect(log.outcome).toBe("rate_limited");
    } finally {
      consoleLog.mockRestore();
    }
  });

  test("passes resolved DB-token and legacy users to the live handler", async () => {
    const owner = await createTestUser({
      email: "external-wrapper-owner@example.test",
      name: "External Wrapper Owner",
    });
    const { token } = await createApiToken({
      createdById: owner.id,
      label: "External wrapper token",
      scopes: [ApiTokenScope.TASKS_READ],
    });

    const tokenHandler = vi.fn(async (context: ExternalApiContext) =>
      NextResponse.json({ user: context.user }),
    );
    const tokenResponse = await withExternalApiObservability(
      externalRequest(`Bearer ${token}`),
      "/api/external/v1/test",
      tokenHandler,
      { rateLimitScope: "external-api-token-success-test" },
    );

    expect(tokenResponse.status).toBe(200);
    expect(tokenHandler).toHaveBeenCalledOnce();
    expect(tokenHandler.mock.calls[0]?.[0].user).toEqual({
      scopes: [ApiTokenScope.TASKS_READ],
      userId: owner.id,
    });

    await createTestUser({
      email: demoUser.email,
      id: demoUser.id,
      name: demoUser.name,
    });
    vi.stubEnv("EXTERNAL_USER_ID", "");

    try {
      const legacyHandler = vi.fn(async (context: ExternalApiContext) =>
        NextResponse.json({ user: context.user }),
      );
      const legacyResponse = await withExternalApiObservability(
        externalRequest(`Bearer ${process.env.EXTERNAL_API_KEY ?? ""}`),
        "/api/external/v1/test",
        legacyHandler,
        { rateLimitScope: "external-api-legacy-success-test" },
      );

      expect(legacyResponse.status).toBe(200);
      expect(legacyHandler).toHaveBeenCalledOnce();
      expect(legacyHandler.mock.calls[0]?.[0].user).toEqual({
        scopes: Object.values(ApiTokenScope),
        userId: demoUser.id,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("returns 404 when the direct legacy user lookup cannot find its user", async () => {
    const missingUserId = randomUUID();
    const legacyApiKey = "direct-legacy-user-test-key";
    vi.stubEnv("EXTERNAL_API_KEY", legacyApiKey);
    vi.stubEnv("EXTERNAL_USER_ID", missingUserId);

    try {
      const handler = vi.fn(async () => NextResponse.json({ ok: true }));
      const response = await expectExternalApiError(
        await withExternalApiObservability(
          externalRequest(`Bearer ${legacyApiKey}`),
          "/api/external/v1/test",
          handler,
          { rateLimitScope: "external-api-missing-legacy-user-test" },
        ),
        404,
        "External API user was not found.",
      );

      expect(response.headers.get("X-RateLimit-Limit")).toBe(
        String(externalRateLimit),
      );
      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("reports zero completion for a board without qualifying tasks", async () => {
    const user = await createTestUser({
      email: "empty-external-summary@example.test",
      name: "Empty External Summary User",
    });
    const board = await createTestBoard(user.id);

    const summary = await buildExternalDailySummary(user.id);

    expect(summary.summary).toMatchObject({
      byCategory: { [board.slug]: 0 },
      completionRate: "0%",
      totalActive: 0,
    });
    expect(summary.recentlyCompleted).toEqual([]);
  });

  test("sorts recently completed tasks newest first", async () => {
    const user = await createTestUser({
      email: "external-summary@example.test",
      name: "External Summary User",
    });
    const board = await createTestBoard(user.id);
    const now = Date.now();

    await prisma.task.createMany({
      data: [
        {
          boardId: board.id,
          completedAt: new Date(now - 2 * millisecondsPerDay),
          id: randomUUID(),
          priority: PrismaItemPriority.NONE,
          sortOrder: 0,
          status: PrismaTaskStatus.DONE,
          title: "Completed earlier",
        },
        {
          boardId: board.id,
          completedAt: new Date(now - millisecondsPerDay),
          id: randomUUID(),
          priority: PrismaItemPriority.NONE,
          sortOrder: 1,
          status: PrismaTaskStatus.DONE,
          title: "Completed later",
        },
      ],
    });

    const summary = await buildExternalDailySummary(user.id);

    expect(summary.recentlyCompleted.map((task) => task.title)).toEqual([
      "Completed later",
      "Completed earlier",
    ]);
  });
});
