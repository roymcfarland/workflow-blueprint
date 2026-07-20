import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { POST as createTask } from "@/app/api/boards/[slug]/tasks/route";
import { DELETE as deleteBoard, PATCH as updateBoard } from "@/app/api/boards/manage/[slug]/route";
import { POST as createBoard } from "@/app/api/boards/manage/route";
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

function seedBoard(userId: string, slug: string, sortOrder = 0) {
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

function slugParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function requestWithoutBody(path: string, method: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL(path, origin), {
    headers: {
      "content-type": "application/json",
      origin,
    },
    method,
  });
}

function validTaskBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "New task",
    description: null,
    status: "ON_DECK",
    dueDate: null,
    priority: "NONE",
    recurrence: "NONE",
    subtasks: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
  authState.user = null;
  vi.mocked(revalidatePath).mockClear();
});

describe("POST /api/boards/[slug]/tasks", () => {
  test("creates a task on the caller's board", async () => {
    const user = await createTestUser();
    const board = await seedBoard(user.id, "launch");
    authenticate(user);

    const response = await createTask(
      jsonRequest(`/api/boards/${board.slug}/tasks`, validTaskBody({ title: "Ship it" })),
      slugParams(board.slug),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.task.title).toBe("Ship it");
    expect(revalidatePath).toHaveBeenCalledWith(`/boards/${board.slug}`);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  test("rejects an empty title", async () => {
    const user = await createTestUser();
    const board = await seedBoard(user.id, "launch");
    authenticate(user);

    const response = await createTask(
      jsonRequest(`/api/boards/${board.slug}/tasks`, validTaskBody({ title: "   " })),
      slugParams(board.slug),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Task title is required." });
  });

  test("returns 400 for another user's board", async () => {
    const owner = await createTestUser({ email: "owner@example.test" });
    const board = await seedBoard(owner.id, "launch");
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    const response = await createTask(
      jsonRequest(`/api/boards/${board.slug}/tasks`, validTaskBody()),
      slugParams(board.slug),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Board not found." });
  });
});

describe("POST /api/boards/manage", () => {
  test("creates a board for the caller", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await createBoard(jsonRequest("/api/boards/manage", { name: "New Board" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.board).toMatchObject({ name: "New Board", slug: "new-board" });
  });

  test("rejects an empty name", async () => {
    const user = await createTestUser();
    authenticate(user);

    const response = await createBoard(jsonRequest("/api/boards/manage", { name: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Board name is required." });
  });

  test("rejects a duplicate board name for the same user", async () => {
    const user = await createTestUser();
    await seedBoard(user.id, "new-board");
    authenticate(user);

    const response = await createBoard(jsonRequest("/api/boards/manage", { name: "New Board" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "A board with that name already exists.",
    });
  });
});

describe("PATCH /api/boards/manage/[slug]", () => {
  test("renames a board and revalidates both the old and new slug", async () => {
    const user = await createTestUser();
    const board = await seedBoard(user.id, "old-name");
    authenticate(user);

    const response = await updateBoard(
      jsonRequest(`/api/boards/manage/${board.slug}`, { name: "Renamed Board" }, { method: "PATCH" }),
      slugParams(board.slug),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.board.slug).toBe("renamed-board");
    expect(revalidatePath).toHaveBeenCalledWith("/boards/old-name");
    expect(revalidatePath).toHaveBeenCalledWith("/boards/renamed-board");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  test("rejects a rename that collides with another of the caller's boards", async () => {
    const user = await createTestUser();
    const board = await seedBoard(user.id, "board-a", 0);
    await seedBoard(user.id, "board-b", 1);
    authenticate(user);

    const response = await updateBoard(
      jsonRequest(`/api/boards/manage/${board.slug}`, { name: "Board B" }, { method: "PATCH" }),
      slugParams(board.slug),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "A board with that name already exists.",
    });
  });

  test("returns 400 for another user's board", async () => {
    const owner = await createTestUser({ email: "owner@example.test" });
    const board = await seedBoard(owner.id, "launch");
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    const response = await updateBoard(
      jsonRequest(`/api/boards/manage/${board.slug}`, { name: "Hijacked" }, { method: "PATCH" }),
      slugParams(board.slug),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Board not found." });
  });
});

describe("DELETE /api/boards/manage/[slug]", () => {
  test("deletes the board", async () => {
    const user = await createTestUser();
    const board = await seedBoard(user.id, "launch");
    authenticate(user);

    const response = await deleteBoard(
      requestWithoutBody(`/api/boards/manage/${board.slug}`, "DELETE"),
      slugParams(board.slug),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await expect(prisma.board.findUnique({ where: { id: board.id } })).resolves.toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  test("returns 400 for another user's board", async () => {
    const owner = await createTestUser({ email: "owner@example.test" });
    const board = await seedBoard(owner.id, "launch");
    const otherUser = await createTestUser({ email: "other@example.test" });
    authenticate(otherUser);

    const response = await deleteBoard(
      requestWithoutBody(`/api/boards/manage/${board.slug}`, "DELETE"),
      slugParams(board.slug),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Board not found." });
  });
});
