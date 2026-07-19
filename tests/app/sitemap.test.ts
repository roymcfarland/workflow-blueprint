import { describe, expect, test } from "vitest";

import sitemap from "@/app/sitemap";
import { siteConfig } from "@/lib/site-config";

describe("sitemap", () => {
  test("includes only the public landing page", () => {
    const entries = sitemap();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe(`${siteConfig.url}/`);
  });
});
