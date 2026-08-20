import { describe, expect, test, vi } from "vitest";

const siteUrlEnvironmentKeys = [
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

type SiteUrlEnvironmentKey = (typeof siteUrlEnvironmentKeys)[number];

async function loadSiteConfig(
  environment: Partial<Record<SiteUrlEnvironmentKey, string>> = {},
) {
  vi.resetModules();

  try {
    for (const key of siteUrlEnvironmentKeys) {
      vi.stubEnv(key, environment[key]);
    }

    return (await import("@/lib/site-config")).siteConfig;
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
}

describe("siteConfig", () => {
  test("falls back to the production site URL when no URL is configured", async () => {
    const siteConfig = await loadSiteConfig();

    expect(siteConfig.url).toBe("https://www.workflowblueprint.io");
  });

  test("falls back to the production site URL when the configured URL is invalid", async () => {
    const siteConfig = await loadSiteConfig({ NEXT_PUBLIC_SITE_URL: "https:// " });

    expect(siteConfig.url).toBe("https://www.workflowblueprint.io");
  });

  test("adds HTTPS to a configured bare host", async () => {
    const siteConfig = await loadSiteConfig({ NEXT_PUBLIC_SITE_URL: "example.test" });

    expect(siteConfig.url).toBe("https://example.test");
  });

  test.each([
    {
      expected: "https://site.test",
      key: "SITE_URL" as const,
      value: "https://site.test",
    },
    {
      expected: "https://project-production.test",
      key: "VERCEL_PROJECT_PRODUCTION_URL" as const,
      value: "project-production.test",
    },
    {
      expected: "https://deployment.test",
      key: "VERCEL_URL" as const,
      value: "deployment.test",
    },
  ])(
    "uses $key when earlier URL variables are absent",
    async ({ expected, key, value }) => {
      const siteConfig = await loadSiteConfig({ [key]: value });

      expect(siteConfig.url).toBe(expected);
    },
  );
});
