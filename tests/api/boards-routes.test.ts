import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { POST as reorderBoards } from "@/app/api/boards/reorder/route";
import { prisma } from "@/lib/db";
import { starterBoard } from "@/lib/domain";
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

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => authState.user),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

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

async function seedRateLimit(scope: string, user: TestUser, limit: number) {
  await prisma.rateLimitBucket.create({
    data: {
      key: `${scope}:local:${user.id.toLowerCase()}`,
      count: limit,
      resetAt: new Date(Date.now() + 60_000),
    },
  });
}

function expectRateLimited(response: Response) {
  expect(response.status).toBe(429);
  expect(response.headers.has("Retry-After")).toBe(true);
}

function createBoard(userId: string, slug: string, sortOrder: number) {
  return prisma.board.create({
    data: {
      description: starterBoard.description,
      iconKey: starterBoard.iconKey,
      id: randomUUID(),
      name: slug,
      slug,
      sortOrder,
      userId,
    },
  });
}

async function expectOk(response: Response) {
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ ok: true });
}

async function expectBadRequest(response: Response, message: string) {
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ message });
}

describe("board route handlers", () => {
  beforeEach(async () => {
    await resetDatabase();
    authState.user = null;
    vi.mocked(revalidatePath).mockClear();
  });

  test("POST /api/boards/reorder returns 429 when the rate limit is exceeded", async () => {
    const user = await createTestUser();
    authenticate(user);
    await seedRateLimit("boards-reorder", user, 60);

    const response = await reorderBoards(
      jsonRequest("/api/boards/reorder", { boardSlugs: ["board-slug"] }),
    );

    expectRateLimited(response);
  });

  test("POST /api/boards/reorder returns 400 for an invalid payload", async () => {
    const user = await createTestUser();
    authenticate(user);

    await expectBadRequest(
      await reorderBoards(
        jsonRequest("/api/boards/reorder", {
          boardSlugs: ["duplicate", "duplicate"],
        }),
      ),
      "Reorder payload contains duplicate board slugs.",
    );
  });

  test("POST /api/boards/reorder assigns board sort order", async () => {
    const user = await createTestUser();
    const first = await createBoard(user.id, "first-board", 0);
    const second = await createBoard(user.id, "second-board", 1);
    authenticate(user);

    await expectOk(
      await reorderBoards(
        jsonRequest("/api/boards/reorder", { boardSlugs: [second.slug, first.slug] }),
      ),
    );

    await expect(
      prisma.board.findMany({
        orderBy: { sortOrder: "asc" },
        select: { slug: true, sortOrder: true },
        where: { userId: user.id },
      }),
    ).resolves.toEqual([
      { slug: second.slug, sortOrder: 0 },
      { slug: first.slug, sortOrder: 1 },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  test("POST /api/boards/reorder rejects another user's board", async () => {
    const owner = await createTestUser({ email: "board-owner@example.test" });
    const otherUser = await createTestUser({ email: "board-other@example.test" });
    const ownerBoard = await createBoard(owner.id, "owner-board", 0);
    const otherBoard = await createBoard(otherUser.id, "other-board", 0);
    authenticate(owner);

    await expectBadRequest(
      await reorderBoards(jsonRequest("/api/boards/reorder", { boardSlugs: [otherBoard.slug] })),
      "One or more boards could not be found.",
    );

    await expect(
      prisma.board.findUniqueOrThrow({
        select: { sortOrder: true },
        where: { id: ownerBoard.id },
      }),
    ).resolves.toEqual({ sortOrder: 0 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("POST /api/boards/reorder requires authentication", async () => {
    const response = await reorderBoards(jsonRequest("/api/boards/reorder", { boardSlugs: ["x"] }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Authentication is required." });
  });
});
