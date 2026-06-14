import {
  Prisma,
  ItemPriority as PrismaItemPriority,
  RecurrencePattern as PrismaRecurrencePattern,
  TaskStatus as PrismaTaskStatus,
  ThemePreference as PrismaThemePreference,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { addDays, addMonths, addWeeks, addYears, subDays } from "date-fns";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { expandDemoSeed } from "@/lib/demo-data";
import {
  MAX_ATTACHMENTS_PER_TASK,
  MAX_CHECKLIST_ITEMS_PER_TASK,
  MAX_LABELS_PER_TASK,
  starterBoard,
  slugify,
  themePreferenceDbMap,
  themePreferenceUiMap,
  type ItemPriority,
  type RecurrencePattern,
  type TaskStatus,
  type ThemePreference,
} from "@/lib/domain";
import { removeStorageObject } from "@/lib/storage";
import type {
  AttachmentRecordInput,
  ChecklistCreateInput,
  ChecklistUpdateInput,
  CreateBoardInput,
  LabelCreateInput,
  ProfileInput,
  SubtaskCreateInput,
  SubtaskReorderInput,
  SubtaskUpdateInput,
  TaskInput,
  TaskReorderInput,
  UpdateBoardInput,
} from "@/lib/validators";

/** Generous abuse caps to prevent runaway data creation (not product limits - adjust freely). */
export const MAX_BOARDS_PER_USER = 100;
export const MAX_TASKS_PER_BOARD = 1000;

const taskInclude = {
  attachments: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },
  checklist: {
    orderBy: {
      sortOrder: "asc" as const,
    },
  },
  labels: {
    orderBy: {
      sortOrder: "asc" as const,
    },
  },
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

const apiTokenListSelect = {
  id: true,
  label: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: {
    select: {
      email: true,
      name: true,
    },
  },
} satisfies Prisma.ApiTokenSelect;

type DbApiTokenListItem = Prisma.ApiTokenGetPayload<{ select: typeof apiTokenListSelect }>;

export type BoardNavItem = {
  slug: string;
  name: string;
  iconKey: string;
  accentColor?: string | null;
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

export type SerializedLabel = {
  id: string;
  text: string;
  color: string;
  sortOrder: number;
};

export type SerializedChecklistItem = {
  id: string;
  text: string;
  isComplete: boolean;
  sortOrder: number;
};

export type SerializedAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
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
  recurrence: RecurrencePattern;
  subtasks: SerializedSubtask[];
  labels?: SerializedLabel[];
  checklist?: SerializedChecklistItem[];
  attachments?: SerializedAttachment[];
};

export type BoardSnapshot = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  accentColor?: string | null;
  iconKey: string;
  noteContent: string;
  tasks: SerializedTask[];
};

export type DashboardSubtaskSummary = {
  id: string;
  title: string;
  isComplete: boolean;
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
  boardAccentColor: string | null;
  subtasks: DashboardSubtaskSummary[];
};

export type DashboardSnapshot = {
  boardBreakdown: Array<{
    slug: string;
    name: string;
    iconKey: string;
    accentColor?: string | null;
    totalTasks: number;
    percentage: number;
  }>;
  completionRate: number;
  doneCount: number;
  activeTaskCount: number;
  inProgressCount: number;
  closedLastSevenDays: number;
  totalTaskCount: number;
  inProgressTasks: DashboardTaskSummary[];
  overdueTasks: DashboardTaskSummary[];
  upcomingTasks: DashboardTaskSummary[];
};

export type InvitationStatus = "ACCEPTED" | "EXPIRED" | "PENDING" | "REVOKED";

export type ApiTokenStatus = "ACTIVE" | "REVOKED";

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

export type SerializedApiToken = {
  id: string;
  label: string;
  prefix: string;
  status: ApiTokenStatus;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: {
    email: string;
    name: string;
  };
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
    recurrence: task.recurrence as RecurrencePattern,
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      isComplete: subtask.isComplete,
      sortOrder: subtask.sortOrder,
      // Subtasks no longer carry a priority; the external contract still expects the field, so it is a constant.
      priority: "NONE",
    })),
    labels: task.labels.map((label) => ({
      id: label.id,
      text: label.text,
      color: label.color,
      sortOrder: label.sortOrder,
    })),
    checklist: task.checklist.map((item) => ({
      id: item.id,
      text: item.text,
      isComplete: item.isComplete,
      sortOrder: item.sortOrder,
    })),
    attachments: task.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      createdAt: attachment.createdAt.toISOString(),
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

function serializeApiToken(token: DbApiTokenListItem): SerializedApiToken {
  return {
    id: token.id,
    label: token.label,
    prefix: token.prefix,
    status: token.revokedAt ? "REVOKED" : "ACTIVE",
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
    createdBy: token.createdBy,
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

function advanceDueDate(base: Date, recurrence: PrismaRecurrencePattern): Date {
  switch (recurrence) {
    case PrismaRecurrencePattern.DAILY:
      return addDays(base, 1);
    case PrismaRecurrencePattern.WEEKLY:
      return addWeeks(base, 1);
    case PrismaRecurrencePattern.MONTHLY:
      return addMonths(base, 1);
    case PrismaRecurrencePattern.SEMI_ANNUALLY:
      return addMonths(base, 6);
    case PrismaRecurrencePattern.ANNUALLY:
      return addYears(base, 1);
    default:
      return base;
  }
}

async function spawnNextRecurrence(
  tx: DbClient,
  source: {
    boardId: string;
    title: string;
    description: string | null;
    priority: PrismaItemPriority;
    status: PrismaTaskStatus;
    recurrence: PrismaRecurrencePattern;
    dueDate: Date | null;
    subtaskTitles: string[];
  },
  completedAt: Date,
): Promise<void> {
  if (source.recurrence === PrismaRecurrencePattern.NONE) {
    return;
  }

  const sortOrder = await nextSortOrderForStatus(
    tx,
    source.boardId,
    PrismaTaskStatus.IN_PROGRESS,
  );
  const nextDueDate = advanceDueDate(source.dueDate ?? completedAt, source.recurrence);
  // Hide the next occurrence until 3 days before it's due; a source task with no
  // due date has nothing to hide until, so it's visible immediately.
  const visibleAt = source.dueDate ? subDays(nextDueDate, 3) : null;

  await tx.task.create({
    data: {
      id: randomUUID(),
      boardId: source.boardId,
      title: source.title,
      description: source.description,
      status: PrismaTaskStatus.IN_PROGRESS,
      priority: source.priority,
      recurrence: source.recurrence,
      sortOrder,
      dueDate: nextDueDate,
      visibleAt,
      completedAt: null,
      archivedAt: null,
      subtasks: {
        create: source.subtaskTitles.map((title, index) => ({
          id: randomUUID(),
          title,
          isComplete: false,
          sortOrder: index,
        })),
      },
    },
  });
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

function attachmentStoragePrefix(taskId: string) {
  return `tasks/${taskId}`;
}

function assertAttachmentStoragePath(taskId: string, storagePath: string) {
  if (!storagePath.startsWith(`${attachmentStoragePrefix(taskId)}/`)) {
    throw new Error("Attachment storage path is invalid.");
  }
}

function assertAttachmentLimit(count: number) {
  if (count >= MAX_ATTACHMENTS_PER_TASK) {
    throw new Error(`Tasks can include up to ${MAX_ATTACHMENTS_PER_TASK} attachments.`);
  }
}

export function buildAttachmentStoragePath(taskId: string) {
  return `${attachmentStoragePrefix(taskId)}/${randomUUID()}`;
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
        demoExpiresAt: true,
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
        accentColor: true,
      },
    }),
  ]);

  if (!user) {
    return null;
  }

  const { demoExpiresAt, ...shellUser } = user;

  return {
    user: {
      ...shellUser,
      themePreference: themePreferenceToUi(shellUser.themePreference),
      isDemo: demoExpiresAt !== null,
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
  const now = new Date();
  const boards = await prisma.board.findMany({
    where: { userId },
    orderBy: {
      sortOrder: "asc",
    },
    include: {
      tasks: {
        where: { OR: [{ visibleAt: null }, { visibleAt: { lte: now } }] },
        include: taskInclude,
      },
    },
  });

  const allTasks = boards.flatMap((board) =>
    board.tasks.map((task) => ({
      ...task,
      boardSlug: board.slug,
      boardName: board.name,
      boardIconKey: board.iconKey,
      boardAccentColor: board.accentColor,
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
      boardAccentColor: task.boardAccentColor,
      subtasks: task.subtasks.map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        isComplete: subtask.isComplete,
      })),
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

  const inProgressTasks = allTasks
    .filter((task) => task.status === "IN_PROGRESS")
    .sort((a, b) => {
      const ao = a.dashboardSortOrder;
      const bo = b.dashboardSortOrder;

      if (ao === null && bo === null) {
        return a.createdAt.getTime() - b.createdAt.getTime();
      }
      if (ao === null) {
        return 1;
      }
      if (bo === null) {
        return -1;
      }
      if (ao !== bo) {
        return ao - bo;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .map(summarize);

  return {
    boardBreakdown: boards.map((board) => ({
      slug: board.slug,
      name: board.name,
      iconKey: board.iconKey,
      accentColor: board.accentColor,
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
    inProgressTasks,
    overdueTasks,
    upcomingTasks,
  };
}

export async function reorderDashboardInProgressForUser(userId: string, taskIds: string[]) {
  const uniqueIds = [...new Set(taskIds)];

  await prisma.$transaction(
    async (tx) => {
      const tasks = await tx.task.findMany({
        where: {
          id: {
            in: uniqueIds,
          },
          status: PrismaTaskStatus.IN_PROGRESS,
          board: {
            userId,
          },
        },
        select: {
          id: true,
        },
      });

      if (tasks.length !== uniqueIds.length) {
        throw new Error("One or more tasks could not be found.");
      }

      for (let index = 0; index < taskIds.length; index += 1) {
        await tx.task.update({
          where: {
            id: taskIds[index],
            board: {
              userId,
            },
          },
          data: {
            dashboardSortOrder: index,
          },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function markTaskDoneForUser(userId: string, taskId: string) {
  return prisma.$transaction(
    async (tx) => {
      const task = await tx.task.findFirst({
        where: {
          id: taskId,
          board: {
            userId,
          },
        },
        include: {
          subtasks: {
            orderBy: {
              sortOrder: "asc",
            },
          },
        },
      });

      if (!task) {
        throw new Error("Task not found.");
      }

      const wasDone = task.status === PrismaTaskStatus.DONE;
      const sortOrder =
        wasDone
          ? task.sortOrder
          : await nextSortOrderForStatus(tx, task.boardId, PrismaTaskStatus.DONE);
      const { completedAt, archivedAt } = statusDates("DONE", task);

      const updatedTask = await tx.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: PrismaTaskStatus.DONE,
          sortOrder,
          completedAt,
          archivedAt,
        },
      });

      if (!wasDone && task.recurrence !== PrismaRecurrencePattern.NONE) {
        await spawnNextRecurrence(
          tx,
          {
            boardId: task.boardId,
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
            recurrence: task.recurrence,
            dueDate: task.dueDate,
            subtaskTitles: task.subtasks.map((subtask) => subtask.title),
          },
          completedAt ?? new Date(),
        );
      }

      return updatedTask;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function getBoardSnapshot(userId: string, slug: string): Promise<BoardSnapshot | null> {
  const now = new Date();
  const board = await prisma.board.findFirst({
    where: {
      slug,
      userId,
    },
    include: {
      note: true,
      tasks: {
        where: { OR: [{ visibleAt: null }, { visibleAt: { lte: now } }] },
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
    accentColor: board.accentColor,
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

      const taskCount = await tx.task.count({ where: { boardId: board.id } });

      if (taskCount >= MAX_TASKS_PER_BOARD) {
        throw new Error(`This board has reached the maximum of ${MAX_TASKS_PER_BOARD} tasks.`);
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
          recurrence: input.recurrence as PrismaRecurrencePattern,
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
      const wasDone = task.status === PrismaTaskStatus.DONE;
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
          recurrence: input.recurrence as PrismaRecurrencePattern,
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

      if (
        !wasDone &&
        nextStatus === PrismaTaskStatus.DONE &&
        (input.recurrence as PrismaRecurrencePattern) !== PrismaRecurrencePattern.NONE
      ) {
        await spawnNextRecurrence(
          tx,
          {
            boardId: task.boardId,
            title: input.title,
            description: input.description,
            priority: input.priority as PrismaItemPriority,
            status: task.status,
            recurrence: input.recurrence as PrismaRecurrencePattern,
            dueDate: parseDueDate(input.dueDate),
            subtaskTitles: input.subtasks.map((subtask) => subtask.title),
          },
          completedAt ?? new Date(),
        );
      }

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

export async function createLabelForTask(
  userId: string,
  taskId: string,
  input: LabelCreateInput,
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

      if (task.labels.length >= MAX_LABELS_PER_TASK) {
        throw new Error("Tasks can include up to 10 labels.");
      }

      const sortOrder =
        task.labels.reduce(
          (highestSortOrder, label) => Math.max(highestSortOrder, label.sortOrder),
          -1,
        ) + 1;

      await tx.taskLabel.create({
        data: {
          id: randomUUID(),
          taskId: task.id,
          text: input.text,
          color: input.color,
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

export async function createChecklistItemForTask(
  userId: string,
  taskId: string,
  input: ChecklistCreateInput,
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

      if (task.checklist.length >= MAX_CHECKLIST_ITEMS_PER_TASK) {
        throw new Error("Tasks can include up to 50 checklist items.");
      }

      const sortOrder =
        task.checklist.reduce(
          (highestSortOrder, item) => Math.max(highestSortOrder, item.sortOrder),
          -1,
        ) + 1;

      await tx.checklistItem.create({
        data: {
          id: randomUUID(),
          taskId: task.id,
          text: input.text,
          isComplete: false,
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

export async function assertCanCreateAttachmentForUser(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      board: {
        userId,
      },
    },
    select: {
      _count: {
        select: {
          attachments: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error("Task not found.");
  }

  assertAttachmentLimit(task._count.attachments);
}

export async function createAttachmentRecord(
  userId: string,
  taskId: string,
  input: AttachmentRecordInput,
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

      assertAttachmentLimit(task.attachments.length);
      assertAttachmentStoragePath(task.id, input.storagePath);

      await tx.attachment.create({
        data: {
          id: randomUUID(),
          taskId: task.id,
          fileName: input.fileName,
          contentType: input.contentType,
          size: input.size,
          storagePath: input.storagePath,
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

export async function getAttachmentForDownload(userId: string, attachmentId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      task: {
        board: {
          userId,
        },
      },
    },
    select: {
      fileName: true,
      storagePath: true,
    },
  });

  if (!attachment) {
    throw new Error("Attachment not found.");
  }

  return attachment;
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

export async function updateChecklistItemForUser(
  userId: string,
  itemId: string,
  input: ChecklistUpdateInput,
): Promise<SerializedTask> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.checklistItem.findFirst({
      where: {
        id: itemId,
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

    if (!item) {
      throw new Error("Checklist item not found.");
    }

    await tx.checklistItem.update({
      where: {
        id: itemId,
      },
      data: {
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.isComplete !== undefined ? { isComplete: input.isComplete } : {}),
      },
    });

    const parentTask = await tx.task.findFirst({
      where: {
        id: item.taskId,
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

export async function deleteChecklistItemForUser(
  userId: string,
  itemId: string,
): Promise<SerializedTask> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.checklistItem.findFirst({
      where: {
        id: itemId,
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

    if (!item) {
      throw new Error("Checklist item not found.");
    }

    await tx.checklistItem.delete({
      where: {
        id: itemId,
      },
    });

    const parentTask = await tx.task.findFirst({
      where: {
        id: item.taskId,
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

export async function deleteLabelForUser(
  userId: string,
  labelId: string,
): Promise<SerializedTask> {
  return prisma.$transaction(async (tx) => {
    const label = await tx.taskLabel.findFirst({
      where: {
        id: labelId,
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

    if (!label) {
      throw new Error("Label not found.");
    }

    await tx.taskLabel.delete({
      where: {
        id: labelId,
      },
    });

    const parentTask = await tx.task.findFirst({
      where: {
        id: label.taskId,
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

export async function deleteAttachmentForUser(
  userId: string,
  attachmentId: string,
): Promise<SerializedTask> {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      task: {
        board: {
          userId,
        },
      },
    },
    select: {
      storagePath: true,
      taskId: true,
    },
  });

  if (!attachment) {
    throw new Error("Attachment not found.");
  }

  await removeStorageObject(attachment.storagePath);

  return prisma.$transaction(async (tx) => {
    const deleted = await tx.attachment.deleteMany({
      where: {
        id: attachmentId,
        task: {
          board: {
            userId,
          },
        },
      },
    });

    if (deleted.count !== 1) {
      throw new Error("Attachment not found.");
    }

    const parentTask = await tx.task.findFirst({
      where: {
        id: attachment.taskId,
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

  await prisma.$transaction(
    async (tx) => {
      const tasks = await tx.task.findMany({
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

  const boardCount = await prisma.board.count({ where: { userId } });

  if (boardCount >= MAX_BOARDS_PER_USER) {
    throw new Error(`You've reached the maximum of ${MAX_BOARDS_PER_USER} boards.`);
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
      accentColor: input.accentColor ?? null,
      sortOrder: (maxSort?.sortOrder ?? -1) + 1,
    },
    select: {
      slug: true,
      name: true,
      iconKey: true,
      accentColor: true,
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
      ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    select: {
      slug: true,
      name: true,
      iconKey: true,
      accentColor: true,
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

const demoAccountTtlDays = 1;

/**
 * Provision an isolated, throwaway demo account (per the PROJECT.md "Demo access
 * exception"): a USER-role user with a time-limited demoExpiresAt and a fresh-UUID
 * copy of the full demo seed. Never logs in by password (the demo endpoint issues
 * the session); the password hash is random and unusable.
 */
export async function provisionDemoUser() {
  const id = randomUUID();
  const email = normalizeEmail(`demo-${id}@demo.local`);
  const name = "Bilbo Baggins";
  const passwordHash = await hash(randomUUID(), 12);
  const demoExpiresAt = addDays(new Date(), demoAccountTtlDays);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id,
        email,
        name,
        avatarLabel: avatarLabelFor(name, email),
        passwordHash,
        demoExpiresAt,
      },
      select: {
        id: true,
        name: true,
        email: true,
        passwordChangedAt: true,
      },
    });

    for (const board of expandDemoSeed()) {
      await tx.board.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          name: board.name,
          slug: board.slug,
          description: board.description,
          iconKey: board.iconKey,
          sortOrder: board.sortOrder,
          note: {
            create: {
              id: randomUUID(),
              content: board.noteContent,
            },
          },
          tasks: {
            create: board.tasks.map((task) => ({
              id: randomUUID(),
              title: task.title,
              description: task.description,
              status: task.status as PrismaTaskStatus,
              sortOrder: task.sortOrder,
              dueDate: task.dueInDays ? addDays(new Date(), task.dueInDays) : null,
              completedAt: task.completedDaysAgo ? subDays(new Date(), task.completedDaysAgo) : null,
              archivedAt: task.archivedDaysAgo ? subDays(new Date(), task.archivedDaysAgo) : null,
              subtasks: {
                create: task.subtasks.map((subtask) => ({
                  id: randomUUID(),
                  title: subtask.title,
                  isComplete: subtask.isComplete,
                  sortOrder: subtask.sortOrder,
                })),
              },
            })),
          },
        },
      });
    }

    return user;
  });
}

/**
 * Delete demo accounts past their demoExpiresAt (cascades their boards/tasks).
 * Real users (demoExpiresAt = null) are never matched. Returns the count deleted.
 */
export async function purgeExpiredDemoUsers() {
  const result = await prisma.user.deleteMany({
    where: { demoExpiresAt: { lt: new Date() } },
  });
  return result.count;
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

export async function createApiToken({
  createdById,
  label,
}: {
  createdById: string;
  label: string;
}) {
  const rawToken = `wbk_${generateRawToken()}`;

  const token = await prisma.apiToken.create({
    data: {
      id: randomUUID(),
      label: label.trim(),
      tokenHash: hashToken(rawToken),
      prefix: rawToken.slice(0, 12),
      createdById,
    },
    select: apiTokenListSelect,
  });

  return {
    apiToken: serializeApiToken(token),
    token: rawToken,
  };
}

export async function listApiTokens(): Promise<SerializedApiToken[]> {
  const tokens = await prisma.apiToken.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: apiTokenListSelect,
  });

  return tokens.map(serializeApiToken);
}

export async function findActiveApiTokenByRawToken(rawToken: string) {
  if (!rawToken) {
    return null;
  }

  return prisma.apiToken.findFirst({
    where: {
      revokedAt: null,
      tokenHash: hashToken(rawToken),
    },
    select: { id: true },
  });
}

export async function touchApiTokenLastUsed(tokenId: string) {
  await prisma.apiToken.update({
    where: { id: tokenId },
    data: { lastUsedAt: new Date() },
  });
}

export async function revokeApiToken(tokenId: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.apiToken.updateMany({
      where: {
        id: tokenId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    return tx.apiToken.findUnique({
      where: { id: tokenId },
      select: { id: true, label: true },
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
