import { Prisma } from "@/generated/prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";

const cookieMock = vi.hoisted(() => ({
  set: vi.fn(),
}));
const sendWelcomeEmailMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: vi.fn(),
    get: vi.fn(),
    set: cookieMock.set,
  })),
}));

vi.mock("@/lib/email", () => ({
  sendWelcomeEmail: sendWelcomeEmailMock,
}));

vi.mock("@/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data")>();

  return {
    ...actual,
    createUserAccountWithInvitation: vi.fn(actual.createUserAccountWithInvitation),
  };
});

import { POST } from "@/app/api/auth/sign-up/route";
import {
  createInvitation,
  createUserAccountWithInvitation as createUserAccountWithInvitationData,
} from "@/lib/data";
import { prisma } from "@/lib/db";
import { createTestUser, resetDatabase } from "../helpers/database";
import { jsonRequest } from "../helpers/requests";

const invitationFailureResponse = {
  message:
    "We could not complete that sign-up. Check your invitation link or contact your administrator.",
};
const validPassword = "correct horse battery staple";

function signUpRequest(
  email: string,
  inviteToken: string,
  name = "New User",
  init?: RequestInit,
) {
  return jsonRequest(
    "/api/auth/sign-up",
    {
      confirmPassword: validPassword,
      email,
      inviteToken,
      name,
      password: validPassword,
    },
    init,
  );
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

async function createPendingInvitation(email: string) {
  const inviter = await createTestUser({
    email: `inviter-${email}`,
    name: "Inviting Admin",
  });

  return createInvitation({ email, invitedById: inviter.id });
}

describe("POST /api/auth/sign-up", () => {
  beforeEach(async () => {
    await resetDatabase();
    cookieMock.set.mockClear();
    sendWelcomeEmailMock.mockReset().mockResolvedValue({ status: "sent" });
    vi.mocked(createUserAccountWithInvitationData).mockClear();
  });

  test("returns 403 for a cross-origin request", async () => {
    const response = await POST(
      signUpRequest("cross-origin@example.test", "cross-origin-token", "Cross Origin", {
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("rejects an invalid payload", async () => {
    const response = await POST(jsonRequest("/api/auth/sign-up", {}));

    expect(response.status).toBe(400);
  });

  test("returns 429 when the sign-up rate limit is exceeded", async () => {
    await seedRateLimit("sign-up:local:rate-limit@example.test", 5);

    const response = await POST(
      signUpRequest("RATE-LIMIT@EXAMPLE.TEST", "rate-limit-token", "Rate Limited"),
    );

    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(true);
  });

  test("rejects an invalid invitation without creating an account", async () => {
    const response = await POST(signUpRequest("New.User@Example.test", "missing-token"));

    await expect(response.json()).resolves.toEqual(invitationFailureResponse);
    expect(response.status).toBe(400);
    await expect(
      prisma.user.findUnique({ where: { email: "new.user@example.test" } }),
    ).resolves.toBeNull();
  });

  test("uses the generic rejection when the invited email already has an account", async () => {
    const email = "existing@example.test";
    const { token } = await createPendingInvitation(email);
    const existingUser = await createTestUser({ email, name: "Existing User" });

    const response = await POST(signUpRequest(email, token));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(invitationFailureResponse);
    await expect(prisma.user.count({ where: { email } })).resolves.toBe(1);
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toMatchObject({
      id: existingUser.id,
    });
  });

  test("creates an account, establishes a session, and sends a welcome email", async () => {
    const email = "new.user@example.test";
    const { token } = await createPendingInvitation(email);

    const response = await POST(signUpRequest(email, token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      user: expect.objectContaining({
        email,
        name: "New User",
      }),
    });
    expect(body.user).not.toHaveProperty("passwordHash");
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
    expect(sendWelcomeEmailMock).toHaveBeenCalledWith({
      name: "New User",
      to: email,
    });
  });

  test("keeps sign-up successful when the welcome email fails", async () => {
    const email = "welcome-failure@example.test";
    const { token } = await createPendingInvitation(email);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendWelcomeEmailMock.mockRejectedValueOnce(new Error("Resend is down"));

    const response = await POST(signUpRequest(email, token, "Welcome Failure"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      user: { email },
    });
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toMatchObject({
      name: "Welcome Failure",
    });
    expect(consoleError).toHaveBeenCalledWith("Unable to send welcome email.", expect.any(Error));
    consoleError.mockRestore();
  });

  test("uses the generic rejection for a unique-constraint race", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(createUserAccountWithInvitationData).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        clientVersion: "test",
        code: "P2002",
      }),
    );

    const response = await POST(signUpRequest("race@example.test", "race-token"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(invitationFailureResponse);
    expect(cookieMock.set).not.toHaveBeenCalled();
    expect(sendWelcomeEmailMock).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  test("returns a clean 500 when account creation fails unexpectedly", async () => {
    const createAccountMock = vi.mocked(createUserAccountWithInvitationData);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAccountMock.mockRejectedValueOnce(new Error("boom"));

    try {
      const response = await POST(
        signUpRequest("failure@example.test", "failure-token", "Failure User"),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ message: "Unable to create account." });
      expect(consoleError).toHaveBeenCalledWith("Unable to create account.", expect.any(Error));
    } finally {
      createAccountMock.mockRestore();
      consoleError.mockRestore();
    }
  });
});
