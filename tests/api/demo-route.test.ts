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

function demoRequest() {
  return jsonRequest("/api/auth/demo", {});
}

describe("POST /api/auth/demo", () => {
  beforeEach(async () => {
    cookieMock.set.mockClear();
    await resetDatabase();
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
