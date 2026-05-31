import {
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, test, beforeEach } from "vitest";

import {
  createApiToken,
  createBoardForUser,
  createTaskForBoard,
  listApiTokens,
  MAX_BOARDS_PER_USER,
  MAX_TASKS_PER_BOARD,
  revokeApiToken,
} from "@/lib/data";
import { prisma } from "@/lib/db";
import { starterBoard } from "@/lib/domain";
import { createTestBoard, createTestUser, resetDatabase } from "./helpers/database";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function boardRows(userId: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    description: null,
    iconKey: starterBoard.iconKey,
    id: randomUUID(),
    name: `Board ${index}`,
    slug: `board-${index}`,
    sortOrder: index,
    userId,
  }));
}

function taskRows(boardId: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    archivedAt: null,
    boardId,
    completedAt: null,
    description: null,
    dueDate: null,
    id: randomUUID(),
    priority: PrismaItemPriority.NONE,
    sortOrder: index,
    status: PrismaTaskStatus.ON_DECK,
    title: `Task ${index}`,
  }));
}

describe("src/lib/data.ts", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("creates a task and subtasks through the Serializable task transaction", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: "",
      dueDate: "2026-05-05",
      priority: "HIGH",
      status: "IN_PROGRESS",
      subtasks: [
        {
          isComplete: false,
          title: "Draft the harness notes",
        },
      ],
      title: "Ship test harness",
    });

    expect(task).toMatchObject({
      description: "",
      dueDate: "2026-05-05T00:00:00.000Z",
      priority: "HIGH",
      sortOrder: 0,
      status: "IN_PROGRESS",
      subtasks: [
        expect.objectContaining({
          isComplete: false,
          priority: "NONE",
          sortOrder: 0,
          title: "Draft the harness notes",
        }),
      ],
      title: "Ship test harness",
    });
    await expect(prisma.task.count()).resolves.toBe(1);
    await expect(prisma.subtask.count()).resolves.toBe(1);
  });

  test("rejects creating a board once the user reaches the board cap", async () => {
    const user = await createTestUser();
    await prisma.board.createMany({ data: boardRows(user.id, MAX_BOARDS_PER_USER) });

    await expect(
      createBoardForUser(user.id, {
        description: null,
        iconKey: starterBoard.iconKey,
        name: "Board over cap",
      }),
    ).rejects.toThrow(`You've reached the maximum of ${MAX_BOARDS_PER_USER} boards.`);
  });

  test("creates a board when the user is just under the board cap", async () => {
    const user = await createTestUser();
    await prisma.board.createMany({ data: boardRows(user.id, MAX_BOARDS_PER_USER - 1) });

    await expect(
      createBoardForUser(user.id, {
        description: null,
        iconKey: starterBoard.iconKey,
        name: "Last allowed board",
      }),
    ).resolves.toMatchObject({
      iconKey: starterBoard.iconKey,
      name: "Last allowed board",
      slug: "last-allowed-board",
    });
  });

  test("rejects creating a task once the board reaches the task cap", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    await prisma.task.createMany({ data: taskRows(board.id, MAX_TASKS_PER_BOARD) });

    await expect(
      createTaskForBoard(user.id, starterBoard.slug, {
        description: null,
        dueDate: null,
        priority: "NONE",
        status: "ON_DECK",
        subtasks: [],
        title: "Task over cap",
      }),
    ).rejects.toThrow(`This board has reached the maximum of ${MAX_TASKS_PER_BOARD} tasks.`);
  });

  test("creates a task when the board is just under the task cap", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    await prisma.task.createMany({ data: taskRows(board.id, MAX_TASKS_PER_BOARD - 1) });

    await expect(
      createTaskForBoard(user.id, starterBoard.slug, {
        description: null,
        dueDate: null,
        priority: "NONE",
        status: "ON_DECK",
        subtasks: [],
        title: "Last allowed task",
      }),
    ).resolves.toMatchObject({
      priority: "NONE",
      sortOrder: MAX_TASKS_PER_BOARD - 1,
      status: "ON_DECK",
      title: "Last allowed task",
    });
  });

  test("creates API tokens with hash-only persistence", async () => {
    const user = await createTestUser({
      email: "admin@example.test",
      name: "Admin User",
    });

    const { apiToken, token } = await createApiToken({
      createdById: user.id,
      label: "  External Consumer  ",
    });

    expect(token).toMatch(/^wbk_/);
    expect(apiToken).toMatchObject({
      createdBy: {
        email: user.email,
        name: user.name,
      },
      label: "External Consumer",
      prefix: token.slice(0, 12),
      status: "ACTIVE",
    });
    expect(apiToken).not.toHaveProperty("tokenHash");

    const row = await prisma.apiToken.findUniqueOrThrow({
      where: { id: apiToken.id },
    });
    const rowValues = Object.values(row).map((value) =>
      value instanceof Date ? value.toISOString() : String(value ?? ""),
    );

    expect(row.tokenHash).toBe(sha256(token));
    expect(row.prefix).toBe(token.slice(0, 12));
    expect(rowValues).not.toContain(token);
  });

  test("lists API tokens newest first without exposing token hashes", async () => {
    const user = await createTestUser();
    const first = await createApiToken({
      createdById: user.id,
      label: "First consumer",
    });
    const second = await createApiToken({
      createdById: user.id,
      label: "Second consumer",
    });

    await prisma.apiToken.update({
      where: { id: first.apiToken.id },
      data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    await prisma.apiToken.update({
      where: { id: second.apiToken.id },
      data: { createdAt: new Date("2026-01-02T00:00:00.000Z") },
    });

    const tokens = await listApiTokens();

    expect(tokens.map((token) => token.label)).toEqual(["Second consumer", "First consumer"]);
    expect(tokens.every((token) => !("tokenHash" in token))).toBe(true);
  });

  test("revokes API tokens once and surfaces revoked status", async () => {
    const user = await createTestUser();
    const { apiToken } = await createApiToken({
      createdById: user.id,
      label: "Reporting partner",
    });

    await expect(revokeApiToken(apiToken.id)).resolves.toEqual({
      id: apiToken.id,
      label: "Reporting partner",
    });

    const row = await prisma.apiToken.findUniqueOrThrow({
      where: { id: apiToken.id },
    });
    expect(row.revokedAt).toBeInstanceOf(Date);

    const [listedToken] = await listApiTokens();
    expect(listedToken).toMatchObject({
      id: apiToken.id,
      revokedAt: expect.any(String),
      status: "REVOKED",
    });

    await expect(revokeApiToken(apiToken.id)).resolves.toBeNull();
    await expect(revokeApiToken("missing-token-id")).resolves.toBeNull();
  });
});
