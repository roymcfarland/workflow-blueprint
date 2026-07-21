import { describe, expect, test } from "vitest";

import { verifyExternalMcpToken } from "@/lib/mcp-auth";

const nonexistentToken = "not-a-real-token-12345";

function mcpRequest(token: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL("/api/external/v1/mcp", origin), {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

describe("verifyExternalMcpToken", () => {
  test("returns undefined when the bearer token does not resolve", async () => {
    await expect(
      verifyExternalMcpToken(mcpRequest(nonexistentToken), nonexistentToken),
    ).resolves.toBeUndefined();
  });
});
