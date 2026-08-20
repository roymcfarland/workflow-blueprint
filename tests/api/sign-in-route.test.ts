import { hashSync } from "bcryptjs";
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

import { POST } from "@/app/api/auth/sign-in/route";
import { prisma } from "@/lib/db";
import { createTestUser, resetDatabase } from "../helpers/database";
import { jsonRequest } from "../helpers/requests";

const validPassword = "correct horse battery staple";
const validPasswordHash = hashSync(validPassword, 12);
const invalidCredentialsResponse = {
  message: "That email and password combination was not recognized.",
};

async function createUserWithPassword(email = "alex@example.test") {
  const user = await createTestUser({ email });

  return prisma.user.update({
    data: { passwordHash: validPasswordHash },
    where: { id: user.id },
  });
}

function signInRequest(email: string, password: string, init?: RequestInit) {
  return jsonRequest("/api/auth/sign-in", { email, password }, init);
}

async function seedRateLimit(key: string, count: number) {
  await prisma.rateLimitBucket.create({
    data: {
      key,
      count,
      resetAt: new Date(Date.now() + 60_000),
    },
  });
}

describe("POST /api/auth/sign-in", () => {
  beforeEach(async () => {
    cookieMock.set.mockClear();
    await resetDatabase();
  });

  test("returns 403 for a cross-origin request", async () => {
    const response = await POST(
      signInRequest("cross-origin@example.test", validPassword, {
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("rejects an invalid payload", async () => {
    const response = await POST(signInRequest("not-an-email", validPassword));

    expect(response.status).toBe(400);
  });

  test("returns 429 when the sign-in rate limit is exceeded", async () => {
    await seedRateLimit("sign-in:local:rate-limit@example.test", 8);

    const response = await POST(signInRequest("RATE-LIMIT@EXAMPLE.TEST", validPassword));

    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(true);
  });

  test("rejects an unknown email", async () => {
    const response = await POST(signInRequest("missing@example.test", validPassword));

    await expect(response.json()).resolves.toEqual(invalidCredentialsResponse);
    expect(response.status).toBe(401);
    expect(cookieMock.set).not.toHaveBeenCalled();
  });

  test("rejects a valid email with the wrong password", async () => {
    await createUserWithPassword();

    const response = await POST(signInRequest("alex@example.test", "wrong horse battery staple"));

    await expect(response.json()).resolves.toEqual(invalidCredentialsResponse);
    expect(response.status).toBe(401);
    expect(cookieMock.set).not.toHaveBeenCalled();
  });

  test("signs in with valid credentials", async () => {
    await createUserWithPassword();

    const response = await POST(signInRequest("alex@example.test", validPassword));

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
  });
});
