import { describe, expect, test, vi } from "vitest";

import { buildContentSecurityPolicy } from "@/lib/csp";

function directive(csp: string, name: string) {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

async function withCspEnvironment(
  environment: Partial<Record<"NODE_ENV" | "VERCEL_ENV", string>>,
  assertion: (
    build: typeof import("@/lib/csp")["buildContentSecurityPolicy"],
  ) => void,
) {
  vi.resetModules();

  try {
    for (const [key, value] of Object.entries(environment)) {
      vi.stubEnv(key, value);
    }

    const { buildContentSecurityPolicy: build } = await import("@/lib/csp");
    assertion(build);
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
}

describe("buildContentSecurityPolicy", () => {
  test("style-src allows inline styles without a nonce (page CSP)", () => {
    const csp = buildContentSecurityPolicy({ nonce: "testnonce123" });
    const styleSrc = directive(csp, "style-src");

    expect(styleSrc).toBe("style-src 'self' 'unsafe-inline'");
    // A nonce on style-src makes browsers ignore 'unsafe-inline' and block
    // inline style attributes, which is the regression this guards against.
    expect(styleSrc).not.toContain("nonce-");
  });

  test("script-src keeps the per-request nonce + strict-dynamic (page CSP)", () => {
    const csp = buildContentSecurityPolicy({ nonce: "testnonce123" });
    const scriptSrc = directive(csp, "script-src");

    expect(scriptSrc).toContain("'nonce-testnonce123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  test("baseline CSP (no nonce) also allows inline styles and has no script nonce", () => {
    const csp = buildContentSecurityPolicy();

    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(csp, "script-src")).toBe("script-src 'self'");
  });

  test("allows eval in development with and without a nonce", async () => {
    await withCspEnvironment({ NODE_ENV: "development" }, (build) => {
      expect(directive(build({ nonce: "testnonce123" }), "script-src")).toContain(
        "'unsafe-eval'",
      );
      expect(directive(build(), "script-src")).toContain("'unsafe-eval'");
    });
  });

  test("upgrades insecure requests on production deployments", async () => {
    await withCspEnvironment({ VERCEL_ENV: "production" }, (build) => {
      expect(directive(build(), "upgrade-insecure-requests")).toBe(
        "upgrade-insecure-requests",
      );
    });
  });
});
