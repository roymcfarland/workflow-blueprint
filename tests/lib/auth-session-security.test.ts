import { ThemePreference as PrismaThemePreference } from "@/generated/prisma/client";
import { SignJWT } from "jose";
import { afterEach, describe, expect, test, vi } from "vitest";

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

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import {
  createSessionToken,
  getCurrentUser,
  requireCurrentAdmin,
  requireCurrentUser,
  themePreferenceToDb,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createTestUser, resetDatabase } from "../helpers/database";

const fallbackAuthSecret = "workflow-blueprint-dev-fallback-secret";
const tokenLifetime = "604800s";

function authSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET?.trim() || fallbackAuthSecret);
}

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

async function createRawSessionToken(payload: Record<string, unknown>, subject?: string) {
  let token = new SignJWT(payload).setProtectedHeader({ alg: "HS256" });

  if (subject !== undefined) {
    token = token.setSubject(subject);
  }

  return token.setIssuedAt().setExpirationTime(tokenLifetime).sign(authSecret());
}

afterEach(async () => {
  cookieMock.sessionToken = undefined;
  cookieMock.set.mockClear();
  vi.unstubAllEnvs();
  await resetDatabase();
});

describe("auth configuration", () => {
  const claims = {
    email: "session@example.test",
    name: "Session Test",
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    sub: "session-user",
  };

  test("maps a theme preference to the Prisma enum", () => {
    expect(themePreferenceToDb("night")).toBe(PrismaThemePreference.NIGHT);
  });

  test("rejects a missing production AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(createSessionToken(claims)).rejects.toThrow(
      "AUTH_SECRET must be configured in production.",
    );
  });

  test("rejects a short production AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "too-short");
    vi.stubEnv("NODE_ENV", "production");

    await expect(createSessionToken(claims)).rejects.toThrow(
      "AUTH_SECRET must be at least 32 characters in production.",
    );
  });

  test("uses the fallback secret outside production", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");

    await expect(createSessionToken(claims)).resolves.toEqual(expect.any(String));
  });
});

describe("getCurrentUser", () => {
  test("returns null when there is no session cookie", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  test("returns null for a signed token without a subject", async () => {
    cookieMock.sessionToken = await createRawSessionToken({
      email: "session@example.test",
      name: "Session Test",
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  test("returns null when the session user does not exist", async () => {
    cookieMock.sessionToken = await createSessionToken({
      email: "missing@example.test",
      name: "Missing User",
      passwordChangedAt: new Date(),
      sub: "missing-user",
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  test("returns null for a session issued before the latest password change", async () => {
    const user = await createTestUser({ email: "stale-session@example.test" });
    cookieMock.sessionToken = await createSessionToken(sessionClaims(user));

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordChangedAt: new Date(user.passwordChangedAt.getTime() + 1_000) },
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  test("returns null for an old-format token without a pwdAt claim", async () => {
    const user = await createTestUser({ email: "old-session@example.test" });
    cookieMock.sessionToken = await createRawSessionToken(
      { email: user.email, name: user.name },
      user.id,
    );

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("auth gates", () => {
  test("requireCurrentUser redirects to the landing page without a session", async () => {
    await expect(requireCurrentUser()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  test("requireCurrentUser returns the authenticated user", async () => {
    const user = await createTestUser({ email: "authenticated@example.test" });
    cookieMock.sessionToken = await createSessionToken(sessionClaims(user));

    await expect(requireCurrentUser()).resolves.toMatchObject({
      email: user.email,
      id: user.id,
    });
  });

  test("requireCurrentAdmin redirects non-admin users to the dashboard", async () => {
    const user = await createTestUser({ email: "non-admin@example.test" });
    cookieMock.sessionToken = await createSessionToken(sessionClaims(user));

    await expect(requireCurrentAdmin()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  test("requireCurrentAdmin returns an authenticated admin", async () => {
    const user = await createTestUser({ email: "admin@example.test" });
    const admin = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
    cookieMock.sessionToken = await createSessionToken(sessionClaims(admin));

    await expect(requireCurrentAdmin()).resolves.toMatchObject({
      id: admin.id,
      role: "ADMIN",
    });
  });
});
