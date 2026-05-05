import { afterEach, describe, expect, test, vi } from "vitest";

describe("sentry.server.config beforeSend", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("strips Authorization headers from captured events", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.resetModules();

    const { beforeSend } = await import("../../sentry.server.config");
    const event = {
      request: {
        headers: {
          Authorization: "Bearer SECRET-TOKEN-1234567890",
          authorization: "Bearer SECRET-TOKEN-1234567890",
          "user-agent": "test",
        },
      },
    };

    const result = beforeSend(event as never);

    expect(result?.request?.headers).toEqual({ "user-agent": "test" });
    expect(JSON.stringify(result)).not.toContain("SECRET-TOKEN-1234567890");
  });
});
