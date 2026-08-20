import { subDays } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";

const cookieMock = vi.hoisted(() => ({
  set: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: vi.fn(),
    get: vi.fn(),
    set: cookieMock.set,
  })),
}));

import { POST } from "@/app/api/auth/demo/route";
import { provisionDemoUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { resetDatabase } from "../helpers/database";
import { jsonRequest } from "../helpers/requests";

function demoRequest(init?: RequestInit) {
  return jsonRequest("/api/auth/demo", {}, init);
}

describe("POST /api/auth/demo", () => {
  beforeEach(async () => {
    cookieMock.set.mockClear();
    await resetDatabase();
  });

  test("returns 403 for a cross-origin request", async () => {
    const response = await POST(
      demoRequest({ headers: { origin: "https://evil.example" } }),
    );

    expect(response.status).toBe(403);
  });

  test("returns 429 when the demo rate limit is exceeded", async () => {
    await prisma.rateLimitBucket.create({
      data: {
        key: "demo:local",
        count: 5,
        resetAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await POST(demoRequest());

    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(true);
  });

  test("provisions a demo sandbox and sets a session cookie", async () => {
    const response = await POST(demoRequest());

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(cookieMock.set).toHaveBeenCalledWith(
      "workflow-blueprint-session",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
        sameSite: "lax",
      }),
    );

    const demoUsers = await prisma.user.findMany({ where: { demoExpiresAt: { not: null } } });
    expect(demoUsers).toHaveLength(1);
    expect(demoUsers[0]?.role).toBe("USER");
  });

  test("purges expired demo accounts on entry", async () => {
    const expired = await provisionDemoUser();
    await prisma.user.update({
      where: { id: expired.id },
      data: { demoExpiresAt: subDays(new Date(), 1) },
    });

    await POST(demoRequest());

    expect(await prisma.user.findUnique({ where: { id: expired.id } })).toBeNull();
    const demoUsers = await prisma.user.findMany({ where: { demoExpiresAt: { not: null } } });
    expect(demoUsers).toHaveLength(1);
  });
});
