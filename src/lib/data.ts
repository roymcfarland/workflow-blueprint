import {
  Prisma,
  TaskStatus as PrismaTaskStatus,
  ItemPriority as PrismaItemPriority,
  ThemePreference as PrismaThemePreference,
} from "@prisma/client";
import { addDays, subDays } from "date-fns";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import {
  starterBoard,
  slugify,
  themePreferenceDbMap,
  themePreferenceUiMap,
  type ItemPriority,
  type TaskStatus,
  type ThemePreference,
} from "@/lib/domain";
import type {
  CreateBoardInput,
  ProfileInput,
  SubtaskCreateInput,
  SubtaskReorderInput,
  SubtaskUpdateInput,
  TaskInput,
  TaskReorderInput,
  UpdateBoardInput,
} from "@/lib/validators";

const taskInclude = {
  subtasks: {
    orderBy: {
      sortOrder: "asc" as const,
    },
  },
} satisfies Prisma.TaskInclude;

type DbTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const invitationListSelect = {
  id: true,
  email: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  invitedBy: {
    select: {
      email: true,
      name: true,
    },
  },
  acceptedBy: {
    select: {
      email: true,
      name: true,
    },
  },
} satisfies Prisma.InvitationSelect;

type DbInvitationListItem = Prisma.InvitationGetPayload<{ select: typeof invitationListSelect }>;

export type BoardNavItem = {
  slug: string;
  name: string;
  iconKey: string;
};

export type BoardSummary = {
  slug: string;
  name: string;
  description: string | null;
  iconKey: string;
  totalTasks: number;
};

export type SerializedSubtask = {
  id: string;
  title: string;
  isComplete: boolean;
  sortOrder: number;
  priority: ItemPriority;
};

export type SerializedTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  sortOrder: number;
  priority: ItemPriority;
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

export type DashboardTaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: ItemPriority;
  dueDate: string | null;
  boardSlug: string;
  boardName: string;
  boardIconKey: string;
};

export type DashboardSnapshot = {
  boardBreakdown: Array<{
    slug: string;
    name: string;
    iconKey: string;
    totalTasks: number;
    percentage: number;
  }>;
  completionRate: number;
  doneCount: number;
  activeTaskCount: number;
  inProgressCount: number;
  closedLastSevenDays: number;
  totalTaskCount: number;
  overdueTasks: DashboardTaskSummary[];
  upcomingTasks: DashboardTaskSummary[];
};

export type InvitationStatus = "ACCEPTED" | "EXPIRED" | "PENDING" | "REVOKED";

export type SerializedInvitation = {
  id: string;
  email: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  invitedBy: {
    email: string;
    name: string;
  };
  acceptedBy: {
    email: string;
    name: string;
  } | null;
};

class InvitationAcceptanceConflictError extends Error {
  constructor() {
    super("Invitation could not be accepted.");
    this.name = "InvitationAcceptanceConflictError";
  }
}

function serializeTask(task: DbTask): SerializedTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    sortOrder: task.sortOrder,
    priority: task.priority as ItemPriority,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      isComplete: subtask.isComplete,
      sortOrder: subtask.sortOrder,
      priority: subtask.priority as ItemPriority,
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

function generateRawToken() {
  return randomBytes(32).toString("base64url");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function invitationStatus(invitation: {
  acceptedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}): InvitationStatus {
  if (invitation.revokedAt) {
    return "REVOKED";
  }

  if (invitation.acceptedAt) {
    return "ACCEPTED";
  }

  if (invitation.expiresAt <= new Date()) {
    return "EXPIRED";
  }

  return "PENDING";
}

function serializeInvitation(invitation: DbInvitationListItem): SerializedInvitation {
  return {
    id: invitation.id,
    email: invitation.email,
    status: invitationStatus(invitation),
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
    invitedBy: invitation.invitedBy,
    acceptedBy: invitation.acceptedBy,
  };
}

async function findBoardForUser(userId: string, slug: string) {
  return prisma.board.findFirst({
    where: {
      slug,
      userId,
    },
  });
}

type DbClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function nextSortOrderForStatus(
  db: DbClient,
  boardId: string,
  status: PrismaTaskStatus,
) {
  const current = await db.task.findFirst({
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

export async function userExists(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  return Boolean(user);
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
        role: true,
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

export async function getBoardSummaries(userId: string): Promise<BoardSummary[]> {
  const boards = await prisma.board.findMany({
    where: { userId },
    orderBy: {
      sortOrder: "asc",
    },
    select: {
      slug: true,
      name: true,
      description: true,
      iconKey: true,
      _count: {
        select: {
          tasks: true,
        },
      },
    },
  });

  return boards.map((board) => ({
    slug: board.slug,
    name: board.name,
    description: board.description,
    iconKey: board.iconKey,
    totalTasks: board._count.tasks,
  }));
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

  const allTasks = boards.flatMap((board) =>
    board.tasks.map((task) => ({
      ...task,
      boardSlug: board.slug,
      boardName: board.name,
      boardIconKey: board.iconKey,
    })),
  );
  const activeStatuses: PrismaTaskStatus[] = ["DONE", "IN_PROGRESS", "ON_DECK"];
  const activeTasks = allTasks.filter((task) => activeStatuses.includes(task.status));
  const doneCount = allTasks.filter((task) => task.status === "DONE").length;
  const inProgressCount = allTasks.filter((task) => task.status === "IN_PROGRESS").length;
  const totalTaskCount = allTasks.length;
  const closedLastSevenDays = allTasks.filter(
    (task) => task.completedAt && task.completedAt >= subDays(new Date(), 7),
  ).length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);
  const openStatuses: PrismaTaskStatus[] = ["IN_PROGRESS", "ON_DECK"];

  function summarize(task: (typeof allTasks)[number]): DashboardTaskSummary {
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority as ItemPriority,
      dueDate: task.dueDate?.toISOString() ?? null,
      boardSlug: task.boardSlug,
      boardName: task.boardName,
      boardIconKey: task.boardIconKey,
    };
  }

  const overdueTasks = allTasks
    .filter(
      (task) =>
        openStatuses.includes(task.status) &&
        task.dueDate !== null &&
        task.dueDate < today,
    )
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
    .slice(0, 6)
    .map(summarize);

  const upcomingTasks = allTasks
    .filter(
      (task) =>
        openStatuses.includes(task.status) &&
        task.dueDate !== null &&
        task.dueDate >= today &&
        task.dueDate <= sevenDaysFromNow,
    )
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
    .slice(0, 6)
    .map(summarize);

  return {
    boardBreakdown: boards.map((board) => ({
      slug: board.slug,
      name: board.name,
      iconKey: board.iconKey,
      totalTasks: board.tasks.length,
      percentage: totalTaskCount === 0 ? 0 : Math.round((board.tasks.length / totalTaskCount) * 100),
    })),
    completionRate:
      activeTasks.length === 0 ? 0 : Math.round((doneCount / activeTasks.length) * 100),
    doneCount,
    activeTaskCount: activeTasks.length,
    inProgressCount,
    closedLastSevenDays,
    totalTaskCount,
    overdueTasks,
    upcomingTasks,
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
  return prisma.$transaction(
    async (tx) => {
      const board = await tx.board.findFirst({
        where: {
          slug: boardSlug,
          userId,
        },
      });

      if (!board) {
        throw new Error("Board not found.");
      }

      const { completedAt, archivedAt } = statusDates(input.status);
      const sortOrder = await nextSortOrderForStatus(
        tx,
        board.id,
        input.status as PrismaTaskStatus,
      );

      const task = await tx.task.create({
        data: {
          id: randomUUID(),
          boardId: board.id,
          title: input.title,
          description: input.description,
          status: input.status as PrismaTaskStatus,
          priority: input.priority as PrismaItemPriority,
          sortOrder,
          dueDate: parseDueDate(input.dueDate),
          completedAt,
          archivedAt,
          subtasks: {
            create: input.subtasks.map((subtask, index) => ({
              id: randomUUID(),
              title: subtask.title,
              isComplete: subtask.isComplete,
              priority: subtask.priority as PrismaItemPriority,
              sortOrder: index,
            })),
          },
        },
        include: taskInclude,
      });

      return serializeTask(task);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateTaskForUser(userId: string, taskId: string, input: TaskInput) {
  return prisma.$transaction(
    async (tx) => {
      const task = await tx.task.findFirst({
        where: {
          id: taskId,
          board: {
            userId,
          },
        },
        include: taskInclude,
      });

      if (!task) {
        throw new Error("Task not found.");
      }

      const nextStatus = input.status as PrismaTaskStatus;
      const sortOrder =
        task.status === nextStatus
          ? task.sortOrder
          : await nextSortOrderForStatus(tx, task.boardId, nextStatus);
      const { completedAt, archivedAt } = statusDates(input.status, task);
      const existingSubtaskIds = new Set(task.subtasks.map((subtask) => subtask.id));
      const submittedIds = new Set(
        input.subtasks
          .map((subtask) => subtask.id)
          .filter((value): value is string => Boolean(value && existingSubtaskIds.has(value))),
      );

      const updatedTask = await tx.task.update({
        where: {
          id: taskId,
        },
        data: {
          title: input.title,
          description: input.description,
          status: nextStatus,
          sortOrder,
          priority: input.priority as PrismaItemPriority,
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
                  priority: subtask.priority as PrismaItemPriority,
                },
                create: {
                  id: subtaskId,
                  title: subtask.title,
                  isComplete: subtask.isComplete,
                  sortOrder: index,
                  priority: subtask.priority as PrismaItemPriority,
                },
              };
            }),
          },
        },
        include: taskInclude,
      });

      return serializeTask(updatedTask);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function deleteTaskForUser(userId: string, taskId: string) {
  const deleted = await prisma.task.deleteMany({
    where: {
      id: taskId,
      board: {
        userId,
      },
    },
  });

  if (deleted.count === 0) {
    throw new Error("Task not found.");
  }
}

export async function createSubtaskForUser(
  userId: string,
  taskId: string,
  input: SubtaskCreateInput,
): Promise<SerializedTask> {
  return prisma.$transaction(
    async (tx) => {
      const task = await tx.task.findFirst({
        where: {
          id: taskId,
          board: {
            userId,
          },
        },
        include: taskInclude,
      });

      if (!task) {
        throw new Error("Task not found.");
      }

      if (task.subtasks.length >= 50) {
        throw new Error("Tasks can include up to 50 subtasks.");
      }

      const sortOrder =
        task.subtasks.reduce(
          (highestSortOrder, subtask) => Math.max(highestSortOrder, subtask.sortOrder),
          -1,
        ) + 1;

      await tx.subtask.create({
        data: {
          id: randomUUID(),
          taskId: task.id,
          title: input.title,
          isComplete: false,
          priority: input.priority as PrismaItemPriority,
          sortOrder,
        },
      });

      const parentTask = await tx.task.findUnique({
        where: {
          id: task.id,
        },
        include: taskInclude,
      });

      if (!parentTask) {
        throw new Error("Task not found.");
      }

      return serializeTask(parentTask);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateSubtaskForUser(
  userId: string,
  subtaskId: string,
  input: SubtaskUpdateInput,
): Promise<SerializedTask> {
  return prisma.$transaction(async (tx) => {
    const subtask = await tx.subtask.findFirst({
      where: {
        id: subtaskId,
        task: {
          board: {
            userId,
          },
        },
      },
      select: {
        taskId: true,
      },
    });

    if (!subtask) {
      throw new Error("Subtask not found.");
    }

    await tx.subtask.update({
      where: {
        id: subtaskId,
      },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.isComplete !== undefined ? { isComplete: input.isComplete } : {}),
        ...(input.priority !== undefined
          ? { priority: input.priority as PrismaItemPriority }
          : {}),
      },
    });

    const parentTask = await tx.task.findFirst({
      where: {
        id: subtask.taskId,
        board: {
          userId,
        },
      },
      include: taskInclude,
    });

    if (!parentTask) {
      throw new Error("Task not found.");
    }

    return serializeTask(parentTask);
  });
}

export async function deleteSubtaskForUser(
  userId: string,
  subtaskId: string,
): Promise<SerializedTask> {
  return prisma.$transaction(async (tx) => {
    const subtask = await tx.subtask.findFirst({
      where: {
        id: subtaskId,
        task: {
          board: {
            userId,
          },
        },
      },
      select: {
        taskId: true,
      },
    });

    if (!subtask) {
      throw new Error("Subtask not found.");
    }

    await tx.subtask.delete({
      where: {
        id: subtaskId,
      },
    });

    const parentTask = await tx.task.findFirst({
      where: {
        id: subtask.taskId,
        board: {
          userId,
        },
      },
      include: taskInclude,
    });

    if (!parentTask) {
      throw new Error("Task not found.");
    }

    return serializeTask(parentTask);
  });
}

export async function reorderSubtasksForUser(
  userId: string,
  taskId: string,
  input: SubtaskReorderInput,
): Promise<SerializedTask> {
  return prisma.$transaction(
    async (tx) => {
      const task = await tx.task.findFirst({
        where: {
          id: taskId,
          board: {
            userId,
          },
        },
        include: taskInclude,
      });

      if (!task) {
        throw new Error("Task not found.");
      }

      const currentSubtaskIds = new Set(task.subtasks.map((subtask) => subtask.id));
      const hasSameSubtasks =
        input.subtaskIds.length === task.subtasks.length &&
        input.subtaskIds.every((subtaskId) => currentSubtaskIds.has(subtaskId));

      if (!hasSameSubtasks) {
        throw new Error("Reorder payload does not match the task's subtasks.");
      }

      for (const [sortOrder, subtaskId] of input.subtaskIds.entries()) {
        const updated = await tx.subtask.updateMany({
          where: {
            id: subtaskId,
            taskId: task.id,
          },
          data: {
            sortOrder,
          },
        });

        if (updated.count !== 1) {
          throw new Error("Reorder payload does not match the task's subtasks.");
        }
      }

      const parentTask = await tx.task.findUnique({
        where: {
          id: task.id,
        },
        include: taskInclude,
      });

      if (!parentTask) {
        throw new Error("Task not found.");
      }

      return serializeTask(parentTask);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
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

  const boardIds = new Set(tasks.map((task) => task.boardId));

  if (boardIds.size !== 1) {
    throw new Error("Tasks must belong to a single board.");
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  await prisma.$transaction(
    async (tx) => {
      for (const item of input.items) {
        const task = tasksById.get(item.taskId);

        if (!task) {
          throw new Error("One or more tasks could not be found.");
        }

        const { completedAt, archivedAt } = statusDates(item.status, task);

        await tx.task.update({
          where: {
            id: item.taskId,
            board: {
              userId,
            },
          },
          data: {
            status: item.status as PrismaTaskStatus,
            sortOrder: item.sortOrder,
            completedAt,
            archivedAt,
          },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
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
      ...(passwordHash ? { passwordHash, passwordChangedAt: new Date() } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarLabel: true,
      themePreference: true,
      role: true,
      passwordChangedAt: true,
    },
  });

  return {
    ...user,
    themePreference: themePreferenceToUi(user.themePreference),
  };
}

function avatarLabelFor(name: string, email: string) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return initials || email[0]?.toUpperCase() || null;
}

export async function createBoardForUser(userId: string, input: CreateBoardInput) {
  const slug = slugify(input.name);

  if (!slug) {
    throw new Error("Board name must produce a valid URL slug.");
  }

  const existing = await prisma.board.findFirst({
    where: { userId, slug },
    select: { id: true },
  });

  if (existing) {
    throw new Error("A board with that name already exists.");
  }

  const maxSort = await prisma.board.findFirst({
    where: { userId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const board = await prisma.board.create({
    data: {
      id: randomUUID(),
      userId,
      name: input.name,
      slug,
      description: input.description ?? null,
      iconKey: input.iconKey,
      sortOrder: (maxSort?.sortOrder ?? -1) + 1,
    },
    select: {
      slug: true,
      name: true,
      iconKey: true,
    },
  });

  return board;
}

export async function updateBoardForUser(userId: string, currentSlug: string, input: UpdateBoardInput) {
  const board = await findBoardForUser(userId, currentSlug);

  if (!board) {
    throw new Error("Board not found.");
  }

  const newSlug = input.name ? slugify(input.name) : undefined;

  if (newSlug && newSlug !== currentSlug) {
    const conflict = await prisma.board.findFirst({
      where: { userId, slug: newSlug, id: { not: board.id } },
      select: { id: true },
    });

    if (conflict) {
      throw new Error("A board with that name already exists.");
    }
  }

  const updated = await prisma.board.update({
    where: { id: board.id },
    data: {
      ...(input.name !== undefined ? { name: input.name, slug: newSlug } : {}),
      ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    select: {
      slug: true,
      name: true,
      iconKey: true,
    },
  });

  return { updated, previousSlug: currentSlug };
}

export async function deleteBoardForUser(userId: string, slug: string) {
  const board = await findBoardForUser(userId, slug);

  if (!board) {
    throw new Error("Board not found.");
  }

  await prisma.board.delete({
    where: { id: board.id },
  });
}

async function createUserWithStarterBoards(
  tx: Prisma.TransactionClient,
  {
    email,
    name,
    passwordHash,
  }: {
    email: string;
    name: string;
    passwordHash: string;
  },
) {
  const normalizedEmail = normalizeEmail(email);
  const user = await tx.user.create({
    data: {
      id: randomUUID(),
      avatarLabel: avatarLabelFor(name, normalizedEmail),
      email: normalizedEmail,
      name,
      passwordHash,
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarLabel: true,
      themePreference: true,
      role: true,
      passwordChangedAt: true,
    },
  });

  await tx.board.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      name: starterBoard.name,
      slug: starterBoard.slug,
      description: starterBoard.description,
      iconKey: starterBoard.iconKey,
      sortOrder: 0,
    },
  });

  return {
    ...user,
    themePreference: themePreferenceToUi(user.themePreference),
  };
}

export async function createUserAccountWithInvitation({
  email,
  inviteToken,
  name,
  passwordHash,
}: {
  email: string;
  inviteToken: string;
  name: string;
  passwordHash: string;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const normalizedEmail = normalizeEmail(email);
      const invitation = await tx.invitation.findUnique({
        where: {
          tokenHash: hashToken(inviteToken),
        },
        select: {
          id: true,
          email: true,
          acceptedAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      });

      if (
        !invitation ||
        invitation.email !== normalizedEmail ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= now
      ) {
        return {
          status: "invalid-invitation" as const,
        };
      }

      const existingUser = await tx.user.findUnique({
        where: {
          email: normalizedEmail,
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        return {
          status: "email-in-use" as const,
        };
      }

      const user = await createUserWithStarterBoards(tx, {
        email: normalizedEmail,
        name,
        passwordHash,
      });
      const claimedInvite = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          acceptedAt: now,
          acceptedByUserId: user.id,
        },
      });

      if (claimedInvite.count === 0) {
        throw new InvitationAcceptanceConflictError();
      }

      return {
        status: "created" as const,
        user,
      };
    });
  } catch (error) {
    if (error instanceof InvitationAcceptanceConflictError) {
      return {
        status: "invalid-invitation" as const,
      };
    }

    throw error;
  }
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: {
      email: normalizeEmail(email),
    },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      passwordChangedAt: true,
    },
  });
}

export async function userExistsByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: {
      email: normalizeEmail(email),
    },
    select: { id: true },
  });

  return Boolean(user);
}

export async function createInvitation({
  email,
  invitedById,
}: {
  email: string;
  invitedById: string;
}) {
  const rawToken = generateRawToken();
  const normalizedEmail = normalizeEmail(email);
  const invitation = await prisma.$transaction(async (tx) => {
    const now = new Date();

    await tx.invitation.updateMany({
      where: {
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
      },
    });

    return tx.invitation.create({
      data: {
        id: randomUUID(),
        email: normalizedEmail,
        tokenHash: hashToken(rawToken),
        invitedById,
        expiresAt: addDays(now, 7),
      },
      select: invitationListSelect,
    });
  });

  return {
    invitation: serializeInvitation(invitation),
    token: rawToken,
  };
}

export async function listInvitations(): Promise<SerializedInvitation[]> {
  const invitations = await prisma.invitation.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: invitationListSelect,
  });

  return invitations.map(serializeInvitation);
}

export async function revokeInvitation(invitationId: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.invitation.updateMany({
      where: {
        id: invitationId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    return tx.invitation.findUnique({
      where: { id: invitationId },
      select: { id: true, email: true },
    });
  });
}

export async function getInvitationPreviewByToken(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: {
      tokenHash: hashToken(token),
    },
    select: {
      email: true,
      acceptedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!invitation || invitationStatus(invitation) !== "PENDING") {
    return null;
  }

  return {
    email: invitation.email,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function createPasswordResetToken(userId: string) {
  const rawToken = generateRawToken();
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

    const now = new Date();
    const claimedToken = await tx.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        usedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        usedAt: now,
      },
    });

    if (claimedToken.count === 0) {
      return null;
    }

    const user = await tx.user.update({
      where: {
        id: resetToken.userId,
      },
      data: {
        passwordHash,
        passwordChangedAt: now,
      },
      select: {
        id: true,
        name: true,
        email: true,
        passwordChangedAt: true,
      },
    });

    return user;
  });
}
