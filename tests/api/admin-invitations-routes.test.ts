import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  GET as listInvitationsRoute,
  POST as createInvitationRoute,
} from "@/app/api/admin/invitations/route";
import { POST as revokeInvitationRoute } from "@/app/api/admin/invitations/[id]/revoke/route";
import { createInvitation as createInvitationData } from "@/lib/data";
import { prisma } from "@/lib/db";
import { createTestUser, resetDatabase } from "../helpers/database";
import { jsonRequest } from "../helpers/requests";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarLabel: string | null;
  role: "ADMIN" | "USER";
  themePreference: "day" | "night" | "system";
  passwordChangedAt: Date;
};

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const authState = vi.hoisted(() => ({
  user: null as AuthUser | null,
}));
const sendInviteEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => authState.user),
}));

vi.mock("@/lib/email", () => ({
  buildAppUrl: vi.fn((path: string) => `http://127.0.0.1:3000${path}`),
  sendInviteEmail: sendInviteEmailMock,
}));

vi.mock("@/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data")>();

  return {
    ...actual,
    createInvitation: vi.fn(actual.createInvitation),
  };
});

function invitationParams(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}

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

async function createAdmin() {
  const user = await createTestUser({
    email: "admin@example.test",
    name: "Admin User",
  });

  return prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });
}

function authenticate(user: TestUser) {
  authState.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarLabel: user.avatarLabel,
    role: user.role,
    themePreference: "day",
    passwordChangedAt: user.passwordChangedAt,
  };
}

describe("admin invitation route handlers", () => {
  beforeEach(async () => {
    await resetDatabase();
    authState.user = null;
    vi.mocked(createInvitationData).mockClear();
    sendInviteEmailMock.mockReset().mockResolvedValue({ status: "sent" });
    vi.unstubAllEnvs();
  });

  test("GET /api/admin/invitations lists invitations for an admin", async () => {
    const admin = await createAdmin();
    authenticate(admin);
    const { invitation } = await createInvitationData({
      email: "listed@example.test",
      invitedById: admin.id,
    });

    const response = await listInvitationsRoute(
      requestWithoutBody("/api/admin/invitations"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      invitations: [
        expect.objectContaining({
          email: "listed@example.test",
          id: invitation.id,
          status: "PENDING",
        }),
      ],
      ok: true,
    });
  });

  test("POST /api/admin/invitations rejects non-admin and anonymous users", async () => {
    const user = await createTestUser({
      email: "user@example.test",
      name: "Regular User",
    });
    authenticate(user);

    const nonAdminResponse = await createInvitationRoute(
      jsonRequest("/api/admin/invitations", { email: "invitee@example.test" }),
    );

    authState.user = null;
    const anonymousResponse = await createInvitationRoute(
      jsonRequest("/api/admin/invitations", { email: "anonymous@example.test" }),
    );

    expect(nonAdminResponse.status).toBe(403);
    expect(anonymousResponse.status).toBe(401);
  });

  test("POST /api/admin/invitations/[id]/revoke rate-limits admin revokes", async () => {
    const admin = await createAdmin();
    authenticate(admin);

    const { invitation } = await createInvitationData({
      email: "invitee@example.test",
      invitedById: admin.id,
    });
    let rateLimitedResponse: Response | null = null;

    for (let attempt = 0; attempt <= 30; attempt += 1) {
      const response = await revokeInvitationRoute(
        requestWithoutBody(
          `/api/admin/invitations/${invitation.id}/revoke`,
          "POST",
        ),
        invitationParams(invitation.id),
      );

      if (response.status === 429) {
        rateLimitedResponse = response;
        break;
      }
    }

    expect(rateLimitedResponse?.status).toBe(429);
    await expect(rateLimitedResponse?.json()).resolves.toEqual({
      message: "Too many attempts. Please try again shortly.",
    });
  });

  test("POST /api/admin/invitations returns a clean 500 when invitation creation fails", async () => {
    const admin = await createAdmin();
    authenticate(admin);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(createInvitationData).mockRejectedValueOnce(new Error("boom"));

    const response = await createInvitationRoute(
      jsonRequest("/api/admin/invitations", { email: "failure@example.test" }),
    );

    consoleError.mockRestore();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to create invitation.",
    });
  });

  test("POST /api/admin/invitations creates an invitation with a local preview URL", async () => {
    const admin = await createAdmin();
    authenticate(admin);

    const response = await createInvitationRoute(
      jsonRequest("/api/admin/invitations", { email: "invitee@example.test" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      invitation: expect.objectContaining({
        email: "invitee@example.test",
        status: "PENDING",
      }),
      message: "Invitation sent.",
      ok: true,
      previewInviteUrl: expect.stringMatching(
        /^http:\/\/127\.0\.0\.1:3000\/sign-up\?invite=.+/,
      ),
    });
    expect(sendInviteEmailMock).toHaveBeenCalledWith({
      inviteUrl: body.previewInviteUrl,
      to: "invitee@example.test",
    });
  });

  test("POST /api/admin/invitations rejects an email with an existing account", async () => {
    const admin = await createAdmin();
    authenticate(admin);
    await createTestUser({ email: "existing@example.test", name: "Existing User" });

    const response = await createInvitationRoute(
      jsonRequest("/api/admin/invitations", { email: "Existing@Example.test" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "That email address already has an account.",
    });
    expect(sendInviteEmailMock).not.toHaveBeenCalled();
  });

  test("POST /api/admin/invitations explains skipped local email delivery", async () => {
    const admin = await createAdmin();
    authenticate(admin);
    sendInviteEmailMock.mockResolvedValueOnce({
      reason: "missing-config",
      status: "skipped",
    });

    const response = await createInvitationRoute(
      jsonRequest("/api/admin/invitations", { email: "skipped@example.test" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      message: "Email is not configured locally. Use the preview invitation link below.",
      ok: true,
      previewInviteUrl: expect.any(String),
    });
  });

  test("POST /api/admin/invitations falls back to a preview when local email fails", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const admin = await createAdmin();
    authenticate(admin);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendInviteEmailMock.mockRejectedValueOnce(new Error("Resend is down"));

    const response = await createInvitationRoute(
      jsonRequest("/api/admin/invitations", { email: "fallback@example.test" }),
    );
    const body = await response.json();

    consoleError.mockRestore();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      message: "Email delivery failed locally. Use the preview invitation link below.",
      ok: true,
      previewInviteUrl: expect.any(String),
    });
  });

  test("POST /api/admin/invitations fails when production email delivery fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const admin = await createAdmin();
    authenticate(admin);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendInviteEmailMock.mockRejectedValueOnce(new Error("Resend is down"));

    const response = await createInvitationRoute(
      jsonRequest("/api/admin/invitations", { email: "production@example.test" }),
    );

    consoleError.mockRestore();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to send invitation.",
    });
  });
});
