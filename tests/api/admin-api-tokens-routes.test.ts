import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  GET as listApiTokensRoute,
  POST as createApiTokenRoute,
} from "@/app/api/admin/api-tokens/route";
import { POST as revokeApiTokenRoute } from "@/app/api/admin/api-tokens/[id]/revoke/route";
import { createApiToken as createApiTokenData } from "@/lib/data";
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

type ApiTokenResponse = {
  apiToken: {
    id: string;
    label: string;
    prefix: string;
    status: "ACTIVE" | "REVOKED";
  };
  ok: true;
  token: string;
};

type ApiTokensResponse = {
  apiTokens: Array<ApiTokenResponse["apiToken"] & { tokenHash?: string }>;
  ok: true;
};

const authState = vi.hoisted(() => ({
  user: null as AuthUser | null,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => authState.user),
}));

vi.mock("@/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data")>();

  return {
    ...actual,
    createApiToken: vi.fn(actual.createApiToken),
  };
});

function apiTokenParams(id: string) {
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

async function createApiTokenViaRoute(label = "News briefing") {
  const response = await createApiTokenRoute(
    jsonRequest("/api/admin/api-tokens", { label }),
  );

  expect(response.status).toBe(200);

  return (await response.json()) as ApiTokenResponse;
}

describe("admin API token route handlers", () => {
  beforeEach(async () => {
    await resetDatabase();
    authState.user = null;
    vi.mocked(createApiTokenData).mockClear();
  });

  test("POST /api/admin/api-tokens creates an API token for admins", async () => {
    const admin = await createAdmin();
    authenticate(admin);

    const body = await createApiTokenViaRoute("External briefing");
    const row = await prisma.apiToken.findUnique({
      where: { id: body.apiToken.id },
    });

    expect(body.token).toMatch(/^wbk_/);
    expect(body.apiToken.status).toBe("ACTIVE");
    expect(row).toMatchObject({
      id: body.apiToken.id,
      label: "External briefing",
      prefix: body.token.slice(0, 12),
    });
  });

  test("POST /api/admin/api-tokens rejects non-admin and anonymous users", async () => {
    const user = await createTestUser({
      email: "user@example.test",
      name: "Regular User",
    });
    authenticate(user);

    const nonAdminResponse = await createApiTokenRoute(
      jsonRequest("/api/admin/api-tokens", { label: "Blocked token" }),
    );

    authState.user = null;
    const anonymousResponse = await createApiTokenRoute(
      jsonRequest("/api/admin/api-tokens", { label: "No user token" }),
    );

    expect(nonAdminResponse.status).toBe(403);
    expect(anonymousResponse.status).toBe(401);
  });

  test("GET /api/admin/api-tokens lists tokens without exposing hashes", async () => {
    const admin = await createAdmin();
    authenticate(admin);

    const created = await createApiTokenViaRoute("Reporting partner");
    const response = await listApiTokensRoute(
      requestWithoutBody("/api/admin/api-tokens"),
    );
    const body = (await response.json()) as ApiTokensResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.apiTokens).toEqual([
      expect.objectContaining({
        id: created.apiToken.id,
        label: "Reporting partner",
        status: "ACTIVE",
      }),
    ]);
    expect(body.apiTokens.every((apiToken) => !("tokenHash" in apiToken))).toBe(true);
  });

  test("POST /api/admin/api-tokens/[id]/revoke revokes tokens and handles errors", async () => {
    const admin = await createAdmin();
    authenticate(admin);

    const created = await createApiTokenViaRoute("Revocable consumer");
    const revokedResponse = await revokeApiTokenRoute(
      requestWithoutBody(
        `/api/admin/api-tokens/${created.apiToken.id}/revoke`,
        "POST",
      ),
      apiTokenParams(created.apiToken.id),
    );
    const listResponse = await listApiTokensRoute(
      requestWithoutBody("/api/admin/api-tokens"),
    );
    const listBody = (await listResponse.json()) as ApiTokensResponse;
    const [listedToken] = listBody.apiTokens;
    const missingResponse = await revokeApiTokenRoute(
      requestWithoutBody("/api/admin/api-tokens/missing-token-id/revoke", "POST"),
      apiTokenParams("missing-token-id"),
    );

    const user = await createTestUser({
      email: "not-admin@example.test",
      name: "Not Admin",
    });
    authenticate(user);

    const forbiddenResponse = await revokeApiTokenRoute(
      requestWithoutBody(
        `/api/admin/api-tokens/${created.apiToken.id}/revoke`,
        "POST",
      ),
      apiTokenParams(created.apiToken.id),
    );

    expect(revokedResponse.status).toBe(200);
    await expect(revokedResponse.json()).resolves.toEqual({ ok: true });
    expect(listedToken).toMatchObject({
      id: created.apiToken.id,
      status: "REVOKED",
    });
    expect(missingResponse.status).toBe(404);
    expect(forbiddenResponse.status).toBe(403);
  });

  test("POST /api/admin/api-tokens/[id]/revoke rate-limits admin revokes", async () => {
    const admin = await createAdmin();
    authenticate(admin);

    let rateLimitedResponse: Response | null = null;

    for (let attempt = 0; attempt <= 30; attempt += 1) {
      const response = await revokeApiTokenRoute(
        requestWithoutBody("/api/admin/api-tokens/missing-token-id/revoke", "POST"),
        apiTokenParams("missing-token-id"),
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

  test("POST /api/admin/api-tokens returns a clean 500 when token creation fails", async () => {
    const admin = await createAdmin();
    authenticate(admin);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(createApiTokenData).mockRejectedValueOnce(new Error("boom"));

    const response = await createApiTokenRoute(
      jsonRequest("/api/admin/api-tokens", { label: "Broken token" }),
    );

    consoleError.mockRestore();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to create API token.",
    });
  });
});
