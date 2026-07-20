import { afterEach, describe, expect, test, vi } from "vitest";

describe("assertEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("passes outside production without AUTH_SECRET or Resend config", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.resetModules();

    const { assertEnv } = await import("@/lib/env");

    expect(() => assertEnv()).not.toThrow();
  });

  test("throws when AUTH_SECRET is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    vi.resetModules();

    const { assertEnv } = await import("@/lib/env");

    expect(() => assertEnv()).toThrow(/AUTH_SECRET/);
    expect(() => assertEnv()).toThrow(/Required\./);
  });

  test("throws when AUTH_SECRET is too short in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "too-short");
    vi.resetModules();

    const { assertEnv } = await import("@/lib/env");

    expect(() => assertEnv()).toThrow(/at least 32 characters in production/);
  });

  test("throws when RESEND_API_KEY or EMAIL_FROM is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.resetModules();

    const { assertEnv } = await import("@/lib/env");

    expect(() => assertEnv()).toThrow(
      "RESEND_API_KEY and EMAIL_FROM must be configured in production for transactional email.",
    );
  });

  test("passes in production with a valid AUTH_SECRET and Resend config", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.resetModules();

    const { assertEnv } = await import("@/lib/env");

    expect(() => assertEnv()).not.toThrow();
  });

  test("only validates once per module instance", async () => {
    vi.resetModules();

    const { assertEnv } = await import("@/lib/env");

    assertEnv();

    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTGRES_PRISMA_URL", "");
    vi.stubEnv("POSTGRES_URL", "");
    vi.stubEnv("POSTGRES_URL_NON_POOLING", "");

    expect(() => assertEnv()).not.toThrow();
  });
});
