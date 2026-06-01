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

function signInRequest(email: string, password: string) {
  return jsonRequest("/api/auth/sign-in", { email, password });
}

describe("POST /api/auth/sign-in", () => {
  beforeEach(async () => {
    cookieMock.set.mockClear();
    await resetDatabase();
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
