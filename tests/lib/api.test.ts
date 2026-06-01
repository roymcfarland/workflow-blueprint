import { describe, expect, test } from "vitest";
import { z } from "zod";

import { assertSameOriginRequest, parseJsonPayload } from "@/lib/api";
import { siteConfig } from "@/lib/site-config";

const routeUrl = `${siteConfig.url}/api/test`;

function expectBlocked(response: Response | null) {
  expect(response).not.toBeNull();
  if (!response) {
    throw new Error("Expected cross-origin request to be blocked.");
  }

  expect(response.status).toBe(403);
}

describe("assertSameOriginRequest", () => {
  test("allows safe methods without origin headers", () => {
    expect(assertSameOriginRequest(new Request(routeUrl))).toBeNull();
  });

  test("allows unsafe requests with a same-origin origin header", () => {
    const request = new Request(routeUrl, {
      headers: {
        origin: siteConfig.url,
      },
      method: "POST",
    });

    expect(assertSameOriginRequest(request)).toBeNull();
  });

  test("rejects unsafe requests with a cross-origin origin header", () => {
    const request = new Request(routeUrl, {
      headers: {
        origin: "https://attacker.example",
      },
      method: "POST",
    });

    expectBlocked(assertSameOriginRequest(request));
  });

  test("allows unsafe requests with a same-origin referer when origin is missing", () => {
    const request = new Request(routeUrl, {
      headers: {
        referer: `${siteConfig.url}/somewhere`,
      },
      method: "POST",
    });

    expect(assertSameOriginRequest(request)).toBeNull();
  });

  test("rejects unsafe requests with a cross-origin referer when origin is missing", () => {
    const request = new Request(routeUrl, {
      headers: {
        referer: "https://attacker.example/somewhere",
      },
      method: "POST",
    });

    expectBlocked(assertSameOriginRequest(request));
  });

  test("rejects unsafe requests without origin or referer headers", () => {
    const request = new Request(routeUrl, { method: "POST" });

    expectBlocked(assertSameOriginRequest(request));
  });
});

describe("parseJsonPayload", () => {
  const schema = z.object({
    title: z.string().min(1),
  });

  test("accepts valid JSON with an application/json content type", async () => {
    const request = new Request(routeUrl, {
      body: JSON.stringify({ title: "Ship release notes" }),
      headers: {
        "content-type": "Application/JSON; charset=utf-8",
      },
      method: "POST",
    });

    const result = await parseJsonPayload(request, schema, "Invalid payload.");

    expect(result).toEqual({
      data: { title: "Ship release notes" },
      ok: true,
    });
  });

  test("rejects missing JSON content type before parsing the body", async () => {
    const request = new Request(routeUrl, {
      body: new TextEncoder().encode("{"),
      method: "POST",
    });

    const result = await parseJsonPayload(request, schema, "Invalid payload.");

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected non-JSON request to be rejected.");
    }

    expect(result.response.status).toBe(415);
    await expect(result.response.json()).resolves.toEqual({
      message: "Request body must be sent as application/json.",
    });
  });

  test("rejects invalid JSON with an application/json content type", async () => {
    const request = new Request(routeUrl, {
      body: "{",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    const result = await parseJsonPayload(request, schema, "Invalid payload.");

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid JSON to be rejected.");
    }

    expect(result.response.status).toBe(400);
  });
});
