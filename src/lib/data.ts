import {
  Prisma,
  TaskStatus as PrismaTaskStatus,
  ThemePreference as PrismaThemePreference,
} from "@prisma/client";
import { addDays, subDays } from "date-fns";
import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import {
  themePreferenceDbMap,
  themePreferenceUiMap,
  type TaskStatus,
  type ThemePreference,
} from "@/lib/domain";
import type { ProfileInput, TaskInput, TaskReorderInput } from "@/lib/validators";

const taskInclude = {
  subtasks: {
    orderBy: {
      sortOrder: "asc" as const,
    },
  },
} satisfies Prisma.TaskInclude;

type DbTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export type BoardNavItem = {
  slug: string;
  name: string;
  iconKey: string;
};

export type SerializedSubtask = {
  id: string;
  title: string;
  isComplete: boolean;
  sortOrder: number;
};

export type SerializedTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  sortOrder: number;
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  subtasks: SerializedSubtask[];
};

export type BoardSnapshot = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconKey: string;
  noteContent: string;
  tasks: SerializedTask[];
};

export type DashboardSnapshot = {
  boardBreakdown: Array<{
    slug: string;
    name: string;
    iconKey: string;
    totalTasks: number;
    percentage: number;
  }>;
  sprintCompletionRate: number;
  doneCount: number;
  activeTaskCount: number;
  inProgressCount: number;
  closedLastSevenDays: number;
  totalTaskCount: number;
};

function serializeTask(task: DbTask): SerializedTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    sortOrder: task.sortOrder,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      isComplete: subtask.isComplete,
      sortOrder: subtask.sortOrder,
    })),
  };
}

function themePreferenceToUi(preference: PrismaThemePreference): ThemePreference {
  return themePreferenceUiMap[preference];
}

function themePreferenceToDb(preference: ThemePreference): PrismaThemePreference {
  return themePreferenceDbMap[preference] as PrismaThemePreference;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function findBoardForUser(userId: string, slug: string) {
  return prisma.board.findFirst({
    where: {
      slug,
      userId,
    },
  });
}

async function findTaskForUser(userId: string, taskId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      board: {
        userId,
      },
    },
    include: taskInclude,
  });
}

async function nextSortOrderForStatus(boardId: string, status: PrismaTaskStatus) {
  const current = await prisma.task.findFirst({
    where: {
      boardId,
      status,
    },
    orderBy: {
      sortOrder: "desc",
    },
    select: {
      sortOrder: true,
    },
  });

  return (current?.sortOrder ?? -1) + 1;
}

function statusDates(status: TaskStatus, existing?: { completedAt: Date | null; archivedAt: Date | null }) {
  const now = new Date();

  if (status === "DONE") {
    return {
      completedAt: existing?.completedAt ?? now,
      archivedAt: null,
    };
  }

  if (status === "ARCHIVED") {
    return {
      completedAt: existing?.completedAt ?? null,
      archivedAt: existing?.archivedAt ?? now,
    };
  }

  return {
    completedAt: null,
    archivedAt: null,
  };
}

function parseDueDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function getShellSnapshot(userId: string) {
  const [user, boards] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarLabel: true,
        themePreference: true,
      },
    }),
    prisma.board.findMany({
      where: { userId },
      orderBy: {
        sortOrder: "asc",
      },
      select: {
        slug: true,
        name: true,
        iconKey: true,
      },
    }),
  ]);

  if (!user) {
    return null;
  }

  return {
    user: {
      ...user,
      themePreference: themePreferenceToUi(user.themePreference),
    },
    boards,
  };
}

export async function getDashboardSnapshot(userId: string): Promise<DashboardSnapshot> {
  const boards = await prisma.board.findMany({
    where: { userId },
    orderBy: {
      sortOrder: "asc",
    },
    include: {
      tasks: true,
    },
  });

  const allTasks = boards.flatMap((board) => board.tasks);
  const activeStatuses: PrismaTaskStatus[] = ["DONE", "IN_PROGRESS", "ON_DECK"];
  const activeTasks = allTasks.filter((task) => activeStatuses.includes(task.status));
  const doneCount = allTasks.filter((task) => task.status === "DONE").length;
  const inProgressCount = allTasks.filter((task) => task.status === "IN_PROGRESS").length;
  const totalTaskCount = allTasks.length;
  const closedLastSevenDays = allTasks.filter(
    (task) => task.completedAt && task.completedAt >= subDays(new Date(), 7),
  ).length;

  return {
    boardBreakdown: boards.map((board) => ({
      slug: board.slug,
      name: board.name,
      iconKey: board.iconKey,
      totalTasks: board.tasks.length,
      percentage: totalTaskCount === 0 ? 0 : Math.round((board.tasks.length / totalTaskCount) * 100),
    })),
    sprintCompletionRate:
      activeTasks.length === 0 ? 0 : Math.round((doneCount / activeTasks.length) * 100),
    doneCount,
    activeTaskCount: activeTasks.length,
    inProgressCount,
    closedLastSevenDays,
    totalTaskCount,
  };
}

export async function getBoardSnapshot(userId: string, slug: string): Promise<BoardSnapshot | null> {
  const board = await prisma.board.findFirst({
    where: {
      slug,
      userId,
    },
    include: {
      note: true,
      tasks: {
        include: taskInclude,
        orderBy: [
          {
            status: "asc",
          },
          {
            sortOrder: "asc",
          },
        ],
      },
    },
  });

  if (!board) {
    return null;
  }

  return {
    id: board.id,
    slug: board.slug,
    name: board.name,
    description: board.description,
    iconKey: board.iconKey,
    noteContent: board.note?.content ?? "",
    tasks: board.tasks.map(serializeTask),
  };
}

export async function createTaskForBoard(userId: string, boardSlug: string, input: TaskInput) {
  const board = await findBoardForUser(userId, boardSlug);

  if (!board) {
    throw new Error("Board not found.");
  }

  const { completedAt, archivedAt } = statusDates(input.status);
  const sortOrder = await nextSortOrderForStatus(board.id, input.status as PrismaTaskStatus);

  const task = await prisma.task.create({
    data: {
      id: randomUUID(),
      boardId: board.id,
      title: input.title,
      description: input.description,
      status: input.status as PrismaTaskStatus,
      sortOrder,
      dueDate: parseDueDate(input.dueDate),
      completedAt,
      archivedAt,
      subtasks: {
        create: input.subtasks.map((subtask, index) => ({
          id: randomUUID(),
          title: subtask.title,
          isComplete: subtask.isComplete,
          sortOrder: index,
        })),
      },
    },
    include: taskInclude,
  });

  return serializeTask(task);
}

export async function updateTaskForUser(userId: string, taskId: string, input: TaskInput) {
  const task = await findTaskForUser(userId, taskId);

  if (!task) {
    throw new Error("Task not found.");
  }

  const nextStatus = input.status as PrismaTaskStatus;
  const sortOrder =
    task.status === nextStatus
      ? task.sortOrder
      : await nextSortOrderForStatus(task.boardId, nextStatus);
  const { completedAt, archivedAt } = statusDates(input.status, task);
  const existingSubtaskIds = new Set(task.subtasks.map((subtask) => subtask.id));
  const submittedIds = new Set(
    input.subtasks
      .map((subtask) => subtask.id)
      .filter((value): value is string => Boolean(value && existingSubtaskIds.has(value))),
  );

  const updatedTask = await prisma.task.update({
    where: {
      id: taskId,
    },
    data: {
      title: input.title,
      description: input.description,
      status: nextStatus,
      sortOrder,
      dueDate: parseDueDate(input.dueDate),
      completedAt,
      archivedAt,
      subtasks: {
        deleteMany: {
          id: {
            in: task.subtasks
              .filter((subtask) => !submittedIds.has(subtask.id))
              .map((subtask) => subtask.id),
          },
        },
        upsert: input.subtasks.map((subtask, index) => {
          const subtaskId =
            subtask.id && existingSubtaskIds.has(subtask.id) ? subtask.id : randomUUID();

          return {
            where: {
              id: subtaskId,
            },
            update: {
              title: subtask.title,
              isComplete: subtask.isComplete,
              sortOrder: index,
            },
            create: {
              id: subtaskId,
              title: subtask.title,
              isComplete: subtask.isComplete,
              sortOrder: index,
            },
          };
        }),
      },
    },
    include: taskInclude,
  });

  return serializeTask(updatedTask);
}

export async function deleteTaskForUser(userId: string, taskId: string) {
  const task = await findTaskForUser(userId, taskId);

  if (!task) {
    throw new Error("Task not found.");
  }

  await prisma.task.delete({
    where: {
      id: taskId,
    },
  });
}

export async function reorderTasksForUser(userId: string, input: TaskReorderInput) {
  const submittedTaskIds = [...new Set(input.items.map((item) => item.taskId))];
  const tasks = await prisma.task.findMany({
    where: {
      id: {
        in: submittedTaskIds,
      },
      board: {
        userId,
      },
    },
  });

  if (tasks.length !== submittedTaskIds.length) {
    throw new Error("One or more tasks could not be found.");
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  await prisma.$transaction(
    input.items.map((item) => {
      const task = tasksById.get(item.taskId);

      if (!task) {
        throw new Error("One or more tasks could not be found.");
      }

      const { completedAt, archivedAt } = statusDates(item.status, task);

      return prisma.task.update({
        where: {
          id: item.taskId,
        },
        data: {
          status: item.status as PrismaTaskStatus,
          sortOrder: item.sortOrder,
          completedAt,
          archivedAt,
        },
      });
    }),
  );
}

export async function updateBoardNote(userId: string, boardSlug: string, content: string) {
  const board = await findBoardForUser(userId, boardSlug);

  if (!board) {
    throw new Error("Board not found.");
  }

  await prisma.boardNote.upsert({
    where: {
      boardId: board.id,
    },
    create: {
      id: randomUUID(),
      boardId: board.id,
      content,
    },
    update: {
      content,
    },
  });
}

export async function updateUserTheme(userId: string, preference: ThemePreference) {
  const user = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      themePreference: themePreferenceToDb(preference),
    },
    select: {
      themePreference: true,
    },
  });

  return themePreferenceToUi(user.themePreference);
}

export async function updateUserProfile(userId: string, input: ProfileInput, passwordHash?: string) {
  const user = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      name: input.name,
      email: input.email,
      themePreference: themePreferenceToDb(input.themePreference),
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarLabel: true,
      themePreference: true,
    },
  });

  return {
    ...user,
    themePreference: themePreferenceToUi(user.themePreference),
  };
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: {
      email,
    },
  });
}

export async function createPasswordResetToken(userId: string) {
  const rawToken = randomUUID();
  const expiresAt = addDays(new Date(), 1);

  await prisma.passwordResetToken.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  return {
    token: rawToken,
    expiresAt,
  };
}

export async function resetPasswordWithToken(token: string, passwordHash: string) {
  return prisma.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!resetToken) {
      return null;
    }

    const claimedToken = await tx.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (claimedToken.count === 0) {
      return null;
    }

    await tx.user.update({
      where: {
        id: resetToken.userId,
      },
      data: {
        passwordHash,
      },
    });

    return resetToken.userId;
  });
}
