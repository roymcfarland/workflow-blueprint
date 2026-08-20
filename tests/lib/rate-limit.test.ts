import { beforeEach, describe, expect, test, vi } from "vitest";

import { prisma } from "@/lib/db";
import { checkRateLimit, evaluateRateLimit } from "@/lib/rate-limit";
import { resetDatabase } from "../helpers/database";

function underlyingPrismaClient() {
  const client = (globalThis as { prisma?: typeof prisma }).prisma;

  if (!client) {
    throw new Error("Expected the test database client to be initialized.");
  }

  return client;
}

describe("rate limiting", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("returns null on success and the existing 429 body on hit", async () => {
    const options = {
      key: "rate-limit-test",
      limit: 1,
      windowMs: 60_000,
    };

    await expect(checkRateLimit(options)).resolves.toBeNull();

    const response = await checkRateLimit(options);

    expect(response).not.toBeNull();
    if (!response) {
      throw new Error("Expected rate-limit response.");
    }

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    await expect(response.json()).resolves.toEqual({
      message: "Too many attempts. Please try again shortly.",
    });
  });

  test("logs and ignores sampled cleanup failures", async () => {
    const cleanupError = new Error("cleanup unavailable");
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const executeRawSpy = vi
      .spyOn(underlyingPrismaClient(), "$executeRaw")
      .mockRejectedValue(cleanupError);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        evaluateRateLimit({
          key: "rate-limit-cleanup-failure",
          limit: 2,
          windowMs: 60_000,
        }),
      ).resolves.toMatchObject({ limited: false, remaining: 1 });
      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Rate limit cleanup failed.",
          cleanupError,
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
      executeRawSpy.mockRestore();
      randomSpy.mockRestore();
    }
  });

  test("fails open and logs when the rate-limit query rejects", async () => {
    const queryError = new Error("database unavailable");
    const queryRawSpy = vi
      .spyOn(underlyingPrismaClient(), "$queryRaw")
      .mockRejectedValue(queryError);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        evaluateRateLimit({
          key: "rate-limit-query-failure",
          limit: 3,
          windowMs: 30_000,
        }),
      ).resolves.toMatchObject({
        limit: 3,
        limited: false,
        remaining: 3,
        retryAfterSeconds: 30,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Rate limit check failed; allowing request.",
        queryError,
      );
    } finally {
      consoleErrorSpy.mockRestore();
      queryRawSpy.mockRestore();
    }
  });
});
