import { randomUUID } from "node:crypto";
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

const sendPasswordResetEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email", () => ({
  buildAppUrl: vi.fn((path: string) => `http://127.0.0.1:3000${path}`),
  sendPasswordResetEmail: sendPasswordResetEmailMock,
}));

import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { GET as previewInvitation } from "@/app/api/auth/invitations/preview/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { POST as signOut } from "@/app/api/auth/sign-out/route";
import { createInvitation, createPasswordResetToken } from "@/lib/data";
import { sessionCookieName } from "@/lib/domain";
import { createTestUser, resetDatabase } from "../helpers/database";
import { jsonRequest } from "../helpers/requests";

const genericResetMessage = "If that account exists, a reset link has been sent.";

function requestWithoutBody(path: string, method = "GET") {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL(path, origin), {
    headers: {
      "content-type": "application/json",
      origin,
    },
    method,
  });
}

beforeEach(async () => {
  await resetDatabase();
  cookieMock.set.mockClear();
  sendPasswordResetEmailMock.mockReset();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/forgot-password", () => {
  test("returns the generic message without sending an email for an unknown address", async () => {
    const response = await forgotPassword(
      jsonRequest("/api/auth/forgot-password", { email: "missing@example.test" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, message: genericResetMessage });
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  test("returns only the generic message in production, with no previewLink key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createTestUser({ email: "alex@example.test" });
    sendPasswordResetEmailMock.mockResolvedValueOnce({ status: "sent" });

    const response = await forgotPassword(
      jsonRequest("/api/auth/forgot-password", { email: "alex@example.test" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, message: genericResetMessage });
    expect(body).not.toHaveProperty("previewLink");
  });

  test("returns a preview link outside production when email delivery is skipped", async () => {
    await createTestUser({ email: "alex@example.test" });
    sendPasswordResetEmailMock.mockResolvedValueOnce({ status: "skipped", reason: "missing-config" });

    const response = await forgotPassword(
      jsonRequest("/api/auth/forgot-password", { email: "alex@example.test" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.message).toBe("Email is not configured locally. Use the preview reset link below.");
    expect(body.previewLink).toContain("/reset-password?token=");
  });

  test("returns a preview link outside production when email delivery throws", async () => {
    await createTestUser({ email: "alex@example.test" });
    sendPasswordResetEmailMock.mockRejectedValueOnce(new Error("Resend is down"));

    const response = await forgotPassword(
      jsonRequest("/api/auth/forgot-password", { email: "alex@example.test" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Email delivery failed locally. Use the preview reset link below.");
    expect(body.previewLink).toContain("/reset-password?token=");
  });

  test("rejects an invalid email address", async () => {
    const response = await forgotPassword(
      jsonRequest("/api/auth/forgot-password", { email: "not-an-email" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: expect.any(String) });
  });
});

describe("GET /api/auth/invitations/preview", () => {
  test("returns the invitation for a valid pending token", async () => {
    const inviter = await createTestUser({ email: "admin@example.test" });
    const { token } = await createInvitation({
      email: "invitee@example.test",
      invitedById: inviter.id,
    });

    const response = await previewInvitation(
      requestWithoutBody(`/api/auth/invitations/preview?token=${encodeURIComponent(token)}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.invitation.email).toBe("invitee@example.test");
  });

  test("returns 404 for an unknown token", async () => {
    const response = await previewInvitation(
      requestWithoutBody(`/api/auth/invitations/preview?token=${randomUUID()}`),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "That invitation is invalid or has expired.",
    });
  });

  test("returns 400 when the token is missing", async () => {
    const response = await previewInvitation(requestWithoutBody("/api/auth/invitations/preview"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: expect.any(String) });
  });
});

describe("POST /api/auth/reset-password", () => {
  test("resets the password and establishes a session for a valid token", async () => {
    const user = await createTestUser({ email: "alex@example.test" });
    const { token } = await createPasswordResetToken(user.id);

    const response = await resetPassword(
      jsonRequest("/api/auth/reset-password", {
        token,
        password: "new secure password",
        confirmPassword: "new secure password",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(cookieMock.set).toHaveBeenCalledWith(
      sessionCookieName,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
        sameSite: "lax",
      }),
    );
  });

  test("rejects an invalid or expired token without creating a session", async () => {
    const response = await resetPassword(
      jsonRequest("/api/auth/reset-password", {
        token: randomUUID(),
        password: "new secure password",
        confirmPassword: "new secure password",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "That reset link is invalid or has expired.",
    });
    expect(cookieMock.set).not.toHaveBeenCalled();
  });

  test("rejects mismatched password confirmation", async () => {
    const user = await createTestUser({ email: "alex@example.test" });
    const { token } = await createPasswordResetToken(user.id);

    const response = await resetPassword(
      jsonRequest("/api/auth/reset-password", {
        token,
        password: "new secure password",
        confirmPassword: "different password",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Passwords must match." });
  });
});

describe("POST /api/auth/sign-out", () => {
  test("clears the session cookie", async () => {
    const response = await signOut(requestWithoutBody("/api/auth/sign-out", "POST"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(cookieMock.set).toHaveBeenCalledWith(
      sessionCookieName,
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });
});
