import { beforeEach, describe, expect, test } from "vitest";

import { checkRateLimit } from "@/lib/rate-limit";
import { resetDatabase } from "../helpers/database";

describe("checkRateLimit", () => {
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
});
