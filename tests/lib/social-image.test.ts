import { describe, expect, test } from "vitest";

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
});
