import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PATCH as patchBoardNote } from "@/app/api/boards/[slug]/note/route";
import { PATCH as patchProfile } from "@/app/api/profile/route";
import { PATCH as patchTheme } from "@/app/api/theme/route";
import { rateLimitKey } from "@/lib/api";
import { prisma } from "@/lib/db";
import { evaluateRateLimit } from "@/lib/rate-limit";
import { createTestBoard, createTestUser, resetDatabase } from "../helpers/database";
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

vi.mock("@/lib/auth", () => ({
  createSessionToken: vi.fn(async () => "test-session-token"),
  getCurrentUser: vi.fn(async () => authState.user),
  setSessionCookie: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function boardParams(slug: string) {
  return {
    params: Promise.resolve({ slug }),
  };
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

function authenticateWithoutRow(id: string) {
  authState.user = {
    id,
    name: "Profile Rate Limit",
    email: "profile-rate-limit@example.test",
    avatarLabel: "PR",
    role: "USER",
    themePreference: "day",
    passwordChangedAt: new Date("2024-01-01T00:00:00Z"),
  };
}

async function fillRateLimitBucket({
  limit,
  request,
  scope,
  userId,
}: {
  limit: number;
  request: Request;
  scope: string;
  userId: string;
}) {
  const key = rateLimitKey(request, scope, userId);

  for (let count = 0; count < limit; count += 1) {
    await evaluateRateLimit({ key, limit, windowMs: 60_000 });
  }
}

async function expectTooManyRequests(response: Response) {
  expect(response.status).toBe(429);
  expect(response.headers.has("Retry-After")).toBe(true);
  await expect(response.json()).resolves.toEqual({
    message: "Too many attempts. Please try again shortly.",
  });
}

describe("user write route handlers", () => {
  beforeEach(async () => {
    await resetDatabase();
    authState.user = null;
    vi.mocked(revalidatePath).mockClear();
  });

  test("PATCH /api/theme returns 401 when unauthenticated", async () => {
    const response = await patchTheme(
      jsonRequest(
        "/api/theme",
        { themePreference: "night" },
        { method: "PATCH" },
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication is required.",
    });
  });

  test("PATCH /api/theme returns 400 for an invalid payload", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await patchTheme(
      jsonRequest(
        "/api/theme",
        { themePreference: "twilight" },
        { method: "PATCH" },
      ),
    );

    expect(response.status).toBe(400);
  });

  test("PATCH /api/theme updates a real user and rate-limits theme writes", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await patchTheme(
      jsonRequest(
        "/api/theme",
        { themePreference: "night" },
        { method: "PATCH" },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      themePreference: "night",
    });

    const rateLimitedRequest = jsonRequest(
      "/api/theme",
      { themePreference: "day" },
      {
        headers: { "x-forwarded-for": "203.0.113.10" },
        method: "PATCH",
      },
    );

    await fillRateLimitBucket({
      limit: 60,
      request: rateLimitedRequest,
      scope: "theme-update",
      userId: user.id,
    });

    await expectTooManyRequests(await patchTheme(rateLimitedRequest));
  });

  test("PATCH /api/boards/[slug]/note returns 401 when unauthenticated", async () => {
    const response = await patchBoardNote(
      jsonRequest(
        "/api/boards/missing-board/note",
        { content: "Launch notes" },
        { method: "PATCH" },
      ),
      boardParams("missing-board"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication is required.",
    });
  });

  test("PATCH /api/boards/[slug]/note returns 400 for an invalid payload", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await patchBoardNote(
      jsonRequest(
        "/api/boards/missing-board/note",
        { content: "x".repeat(5001) },
        { method: "PATCH" },
      ),
      boardParams("missing-board"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Notes should stay under 5000 characters.",
    });
  });

  test("PATCH /api/boards/[slug]/note returns 400 when the board is not found", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await patchBoardNote(
      jsonRequest(
        "/api/boards/missing-board/note",
        { content: "Launch notes" },
        { method: "PATCH" },
      ),
      boardParams("missing-board"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Board not found." });
  });

  test("PATCH /api/boards/[slug]/note updates a board note and rate-limits note writes", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    authenticate(user);

    const response = await patchBoardNote(
      jsonRequest(
        `/api/boards/${board.slug}/note`,
        { content: "Launch notes" },
        { method: "PATCH" },
      ),
      boardParams(board.slug),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await expect(
      prisma.boardNote.findUnique({ where: { boardId: board.id } }),
    ).resolves.toMatchObject({
      content: "Launch notes",
    });

    const rateLimitedRequest = jsonRequest(
      `/api/boards/${board.slug}/note`,
      { content: "Rate limited notes" },
      {
        headers: { "x-forwarded-for": "203.0.113.20" },
        method: "PATCH",
      },
    );

    await fillRateLimitBucket({
      limit: 60,
      request: rateLimitedRequest,
      scope: "board-note",
      userId: user.id,
    });

    await expectTooManyRequests(
      await patchBoardNote(rateLimitedRequest, boardParams(board.slug)),
    );
  });

  test("PATCH /api/profile rate-limits profile writes before profile persistence", async () => {
    const userId = "user_profile_rate_limit";
    authenticateWithoutRow(userId);
    const request = jsonRequest(
      "/api/profile",
      {
        email: "profile-rate-limit@example.test",
        name: "Profile Rate Limit",
        themePreference: "day",
      },
      { method: "PATCH" },
    );

    await fillRateLimitBucket({
      limit: 30,
      request,
      scope: "profile-update",
      userId,
    });

    await expectTooManyRequests(await patchProfile(request));
  });

  test("PATCH /api/profile returns 400 for an invalid payload", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await patchProfile(
      jsonRequest(
        "/api/profile",
        {
          email: "invalid-email",
          name: "Profile User",
          themePreference: "day",
        },
        { method: "PATCH" },
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Enter a valid email address.",
    });
  });

  test("PATCH /api/profile rejects unauthenticated profile writes", async () => {
    authState.user = null;

    const response = await patchProfile(
      jsonRequest(
        "/api/profile",
        {
          email: "anonymous@example.test",
          name: "Anonymous User",
          themePreference: "day",
        },
        { method: "PATCH" },
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication is required.",
    });
  });
});
