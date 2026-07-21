import { compare, hashSync } from "bcryptjs";
import { beforeEach, describe, expect, test, vi } from "vitest";

const cookieMock = vi.hoisted(() => ({
  sessionToken: undefined as string | undefined,
  set: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: vi.fn(),
    get: vi.fn((name: string) =>
      name === "workflow-blueprint-session" && cookieMock.sessionToken
        ? { name, value: cookieMock.sessionToken }
        : undefined,
    ),
    set: cookieMock.set,
  })),
}));

import { PATCH } from "@/app/api/profile/route";
import { createSessionToken, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createTestUser, resetDatabase } from "../helpers/database";
import { jsonRequest } from "../helpers/requests";

const currentPassword = "correct horse battery staple";
const currentPasswordHash = hashSync(currentPassword, 12);

function sessionClaims(user: {
  email: string;
  id: string;
  name: string;
  passwordChangedAt: Date;
}) {
  return {
    email: user.email,
    name: user.name,
    passwordChangedAt: user.passwordChangedAt,
    sub: user.id,
  };
}

async function createAuthenticatedUser({
  email = "profile@example.test",
  passwordChangedAt,
}: {
  email?: string;
  passwordChangedAt?: Date;
} = {}) {
  const createdUser = await createTestUser({ email, name: "Profile User" });
  const user = await prisma.user.update({
    data: {
      passwordHash: currentPasswordHash,
      ...(passwordChangedAt ? { passwordChangedAt } : {}),
    },
    where: { id: createdUser.id },
  });

  cookieMock.sessionToken = await createSessionToken(sessionClaims(user));
  return user;
}

function profileRequest(
  email: string,
  overrides: Partial<{
    confirmPassword: string;
    currentPassword: string;
    name: string;
    newPassword: string;
    themePreference: "day" | "night" | "system";
  }> = {},
) {
  return jsonRequest(
    "/api/profile",
    {
      email,
      name: "Updated Profile",
      themePreference: "night",
      ...overrides,
    },
    { method: "PATCH" },
  );
}

describe("PATCH /api/profile", () => {
  beforeEach(async () => {
    await resetDatabase();
    cookieMock.sessionToken = undefined;
    cookieMock.set.mockClear();
    vi.restoreAllMocks();
  });

  test("updates profile fields and returns a safe user payload", async () => {
    const user = await createAuthenticatedUser();

    const response = await PATCH(profileRequest(user.email));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      user: expect.objectContaining({
        email: user.email,
        id: user.id,
        name: "Updated Profile",
        themePreference: "night",
      }),
    });
    expect(body.user).not.toHaveProperty("passwordHash");
    await expect(prisma.user.findUnique({ where: { id: user.id } })).resolves.toMatchObject({
      name: "Updated Profile",
      themePreference: "NIGHT",
    });
  });

  test("requires the current password for an email change", async () => {
    await createAuthenticatedUser();

    const response = await PATCH(profileRequest("changed@example.test"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Current password is required to change your email or password.",
    });
    expect(cookieMock.set).not.toHaveBeenCalled();
  });

  test("rejects an incorrect current password", async () => {
    await createAuthenticatedUser();

    const response = await PATCH(
      profileRequest("changed@example.test", { currentPassword: "incorrect password" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Current password is incorrect.",
    });
    expect(cookieMock.set).not.toHaveBeenCalled();
  });

  test("changes the password and reissues a session that remains valid", async () => {
    const user = await createAuthenticatedUser({
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const oldSessionToken = cookieMock.sessionToken;
    const newPassword = "new correct horse battery staple";

    const response = await PATCH(
      profileRequest(user.email, {
        confirmPassword: newPassword,
        currentPassword,
        newPassword,
      }),
    );

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

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(compare(newPassword, updatedUser.passwordHash)).resolves.toBe(true);

    const newSessionToken = cookieMock.set.mock.calls[0]?.[1] as string;
    expect(newSessionToken).not.toBe(oldSessionToken);

    cookieMock.sessionToken = oldSessionToken;
    await expect(getCurrentUser()).resolves.toBeNull();

    cookieMock.sessionToken = newSessionToken;
    await expect(getCurrentUser()).resolves.toMatchObject({ id: user.id });
  });

  test("returns 409 when the new email is already registered", async () => {
    await createAuthenticatedUser();
    await createTestUser({ email: "taken@example.test", name: "Existing User" });

    const response = await PATCH(
      profileRequest("taken@example.test", { currentPassword }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "That email address is already in use.",
    });
  });

  test("returns 404 when the authenticated user disappears before the route lookup", async () => {
    const user = await createAuthenticatedUser();
    vi.spyOn(prisma.user, "findUnique")
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(null);

    const response = await PATCH(profileRequest(user.email));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to load the signed-in user.",
    });
  });

  test("returns a clean 500 when the profile update fails", async () => {
    const user = await createAuthenticatedUser();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(prisma.user, "update").mockRejectedValueOnce(new Error("boom"));

    const response = await PATCH(profileRequest(user.email));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: "Unable to save profile." });
    expect(consoleError).toHaveBeenCalledWith("Unable to update profile.", expect.any(Error));
  });
});
