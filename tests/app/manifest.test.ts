import { describe, expect, test } from "vitest";

import manifest from "@/app/manifest";
import { siteConfig } from "@/lib/site-config";

describe("manifest", () => {
  test("returns the app manifest with the correct name and icons", () => {
    const result = manifest();

    expect(result.name).toBe(siteConfig.name);
    expect(result.short_name).toBe(siteConfig.shortName);
    expect(result.start_url).toBe("/");
    expect(result.icons).toHaveLength(3);
  });
});
