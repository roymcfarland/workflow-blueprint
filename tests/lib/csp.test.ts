import { describe, expect, test } from "vitest";

import { buildContentSecurityPolicy } from "@/lib/csp";

function directive(csp: string, name: string) {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
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
});
