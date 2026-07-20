import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { proxy } from "@/proxy";

function requestFor(path: string, headers?: HeadersInit) {
  return new NextRequest(new URL(path, "http://127.0.0.1:3000"), { headers });
}

describe("proxy", () => {
  test("sets a per-request nonce and forwards it to the request pipeline", () => {
    const response = proxy(requestFor("/dashboard"));
    const forwardedNonce = response.headers.get("x-middleware-request-x-nonce");

    expect(forwardedNonce).toMatch(/^[0-9a-f]{32}$/i);
  });

  test("sets a Content-Security-Policy response header containing the nonce", () => {
    const response = proxy(requestFor("/dashboard"));
    const nonce = response.headers.get("x-middleware-request-x-nonce");
    const csp = response.headers.get("content-security-policy");

    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  test("forwards the same Content-Security-Policy value to the request pipeline", () => {
    const response = proxy(requestFor("/dashboard"));

    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(
      response.headers.get("content-security-policy"),
    );
  });

  test("generates a different nonce on each call", () => {
    const first = proxy(requestFor("/dashboard"));
    const second = proxy(requestFor("/dashboard"));

    expect(first.headers.get("x-middleware-request-x-nonce")).not.toBe(
      second.headers.get("x-middleware-request-x-nonce"),
    );
  });

  test("preserves other existing request headers when forwarding", () => {
    const response = proxy(requestFor("/dashboard", { "x-test-header": "hello" }));

    expect(response.headers.get("x-middleware-request-x-test-header")).toBe("hello");
  });
});
