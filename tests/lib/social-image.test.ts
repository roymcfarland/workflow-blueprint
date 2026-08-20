import { describe, expect, test, vi } from "vitest";

import {
  createSocialImageResponse,
  socialImageContentType,
} from "@/lib/social-image";

describe("createSocialImageResponse", () => {
  test("renders a non-empty Open Graph PNG", async () => {
    const response = await createSocialImageResponse("openGraph");

    expect(response.headers.get("content-type")).toBe(socialImageContentType);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test("renders a non-empty Twitter PNG", async () => {
    const response = await createSocialImageResponse("twitter");

    expect(response.headers.get("content-type")).toBe(socialImageContentType);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test("renders without custom fonts when font loading fails", async () => {
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn().mockRejectedValue(new Error("font unavailable")),
    }));

    try {
      const socialImage = await import("@/lib/social-image");
      const response = await socialImage.createSocialImageResponse("openGraph");

      expect(response.headers.get("content-type")).toBe(socialImage.socialImageContentType);
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });
});
