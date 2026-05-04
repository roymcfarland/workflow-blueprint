import {
  ItemPriority as PrismaItemPriority,
  TaskStatus as PrismaTaskStatus,
  ThemePreference as PrismaThemePreference,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { demoUser, starterBoard } from "@/lib/domain";

export async function resetDatabase() {
  await prisma.$transaction([
    prisma.rateLimitBucket.deleteMany(),
    prisma.adminAuditLog.deleteMany(),
    prisma.invitation.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.subtask.deleteMany(),
    prisma.task.deleteMany(),
    prisma.boardNote.deleteMany(),
    prisma.board.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function createTestUser({
  email = "alex@example.test",
  id = randomUUID(),
  name = "Alex Test",
}: {
  email?: string;
  id?: string;
  name?: string;
} = {}) {
  return prisma.user.create({
    data: {
      avatarLabel: "AT",
      email,
      id,
      name,
      passwordHash: "not-used-in-tests",
      themePreference: PrismaThemePreference.DAY,
    },
  });
}

export async function createTestBoard(userId: string) {
  return prisma.board.create({
    data: {
      description: starterBoard.description,
      iconKey: starterBoard.iconKey,
      id: randomUUID(),
      name: starterBoard.name,
      slug: starterBoard.slug,
      sortOrder: 0,
      userId,
    },
  });
}

export async function seedPlanningData() {
  const user = await createTestUser({
    email: demoUser.email,
    id: demoUser.id,
    name: demoUser.name,
  });
  const board = await createTestBoard(user.id);
  const now = new Date();

  await prisma.task.createMany({
    data: [
      {
        boardId: board.id,
        completedAt: null,
        description: "Follow up with launch checklist.",
        dueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        id: randomUUID(),
        priority: PrismaItemPriority.HIGH,
        sortOrder: 0,
        status: PrismaTaskStatus.IN_PROGRESS,
        title: "Prepare launch notes",
      },
      {
        boardId: board.id,
        completedAt: null,
        description: null,
        dueDate: null,
        id: randomUUID(),
        priority: PrismaItemPriority.MEDIUM,
        sortOrder: 0,
        status: PrismaTaskStatus.ON_DECK,
        title: "Review roadmap",
      },
      {
        boardId: board.id,
        completedAt: now,
        description: null,
        dueDate: null,
        id: randomUUID(),
        priority: PrismaItemPriority.NONE,
        sortOrder: 0,
        status: PrismaTaskStatus.DONE,
        title: "Close completed work",
      },
    ],
  });

  return { board, user };
}
