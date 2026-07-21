import {
  ApiTokenScope,
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db";
import {
  buildExternalDailySummary,
  checkExternalApiRateLimit,
  requireExternalApiAccess,
  requireExternalApiUser,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  createTestBoard,
  createTestUser,
  resetDatabase,
} from "../helpers/database";

const externalRateLimit = 120;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

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

async function expectExternalUserError(
  result: Awaited<ReturnType<typeof requireExternalApiUser>>,
  status: number,
  error: string,
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected external API user resolution to fail.");
  }

  expect(result.response.status).toBe(status);
  await expect(result.response.json()).resolves.toEqual({ error, ok: false });

  return result.response;
}

describe("external API auth, rate limiting, and summaries", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("rejects malformed Authorization headers", async () => {
    for (const authorization of ["NotBearer xyz", "Bearer    "]) {
      const response = await expectExternalUserError(
        await requireExternalApiUser(externalRequest(authorization)),
        401,
        "Malformed Authorization header.",
      );

      expect(response.headers.get("WWW-Authenticate")).toBe(
        'Bearer realm="external-api"',
      );
    }
  });

  test("returns 503 when the legacy API key is not configured", async () => {
    const originalApiKey = process.env.EXTERNAL_API_KEY;

    try {
      delete process.env.EXTERNAL_API_KEY;

      await expectExternalUserError(
        await requireExternalApiUser(externalRequest("Bearer any-token")),
        503,
        "External API is not configured.",
      );
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

    const userResult = await requireExternalApiUser(request);
    const accessResult = await requireExternalApiAccess(request);

    expect(userResult.ok).toBe(false);
    expect(accessResult.ok).toBe(false);
    if (userResult.ok || accessResult.ok) {
      throw new Error("Expected both external API access checks to remain limited.");
    }

    expect(userResult.response.status).toBe(429);
    expect(accessResult.response.status).toBe(429);
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
