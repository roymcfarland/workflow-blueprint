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

import {
  clearSessionCookie,
  createSessionToken,
  getCurrentUser,
  setSessionCookie,
} from "@/lib/auth";
import { createTestUser, resetDatabase } from "../helpers/database";

function authSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET?.trim() ?? "workflow-blueprint-dev-fallback-secret",
  );
}

afterEach(async () => {
  cookieMock.sessionToken = undefined;
  cookieMock.set.mockClear();
  await resetDatabase();
});

describe("session cookie", () => {
  test("setSessionCookie uses SameSite=Lax and a persistent maxAge", async () => {
    await setSessionCookie("token-123", false);

    expect(cookieMock.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieMock.set.mock.calls[0];
    expect(name).toBe("workflow-blueprint-session");
    expect(value).toBe("token-123");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  });

  test("rememberMe extends the cookie lifetime to 30 days, still Lax", async () => {
    await setSessionCookie("token-123", true);

    const [, , options] = cookieMock.set.mock.calls[0];
    expect(options.maxAge).toBe(60 * 60 * 24 * 30);
    expect(options.sameSite).toBe("lax");
  });

  test("clearSessionCookie expires the cookie with matching attributes", async () => {
    await clearSessionCookie();

    const [name, value, options] = cookieMock.set.mock.calls[0];
    expect(name).toBe("workflow-blueprint-session");
    expect(value).toBe("");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });

  test("getCurrentUser accepts HS256 sessions and rejects other JWT algorithms", async () => {
    const user = await createTestUser({ email: "session@example.test" });
    const sessionClaims = {
      email: user.email,
      name: user.name,
      passwordChangedAt: user.passwordChangedAt,
      sub: user.id,
    };

    cookieMock.sessionToken = await createSessionToken(sessionClaims);

    await expect(getCurrentUser()).resolves.toMatchObject({
      email: user.email,
      id: user.id,
    });

    cookieMock.sessionToken = await new SignJWT({
      email: user.email,
      name: user.name,
      pwdAt: Math.floor(user.passwordChangedAt.getTime() / 1000),
    })
      .setProtectedHeader({ alg: "HS384" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("604800s")
      .sign(authSecret());

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
