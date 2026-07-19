import { describe, expect, test } from "vitest";

import robots from "@/app/robots";
import { siteConfig } from "@/lib/site-config";

describe("robots", () => {
  test("allows only the public landing page, disallows the app, and points to the sitemap", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rule?.allow).toBe("/");
    expect(rule?.disallow).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/boards",
        "/profile",
        "/admin",
        "/api",
        "/sign-up",
        "/forgot-password",
        "/reset-password",
      ]),
    );
    expect(result.sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
  });
});
