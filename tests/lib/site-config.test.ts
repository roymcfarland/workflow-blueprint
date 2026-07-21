import { afterEach, describe, expect, test, vi } from "vitest";

describe("siteConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("falls back to the production site URL when no URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.resetModules();

    const { siteConfig } = await import("@/lib/site-config");

    expect(siteConfig.url).toBe("https://www.workflowblueprint.io");
  });

  test("falls back to the production site URL when the configured URL is invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https:// ");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.resetModules();

    const { siteConfig } = await import("@/lib/site-config");

    expect(siteConfig.url).toBe("https://www.workflowblueprint.io");
  });
});
