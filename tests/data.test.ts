import {
  ApiTokenScope,
  ItemPriority as PrismaItemPriority,
  RecurrencePattern as PrismaRecurrencePattern,
  TaskStatus as PrismaTaskStatus,
} from "@/generated/prisma/client";
import { subDays } from "date-fns";
import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/storage", () => ({
  createSignedUploadUrl: vi.fn(async () => ({
    uploadUrl: "https://signed.example/upload",
    token: "t",
    path: "p",
  })),
  createSignedDownloadUrl: vi.fn(async () => "https://signed.example/download"),
  removeStorageObject: vi.fn(async () => {}),
}));

import {
  advanceDueDate,
  createApiToken,
  createAttachmentRecord,
  createBoardForUser,
  createChecklistItemForTask,
  createInvitation,
  createLabelForTask,
  createPasswordResetToken,
  createTaskForBoard,
  createUserAccountWithInvitation,
  deleteAttachmentForUser,
  deleteChecklistItemForUser,
  deleteLabelForUser,
  deleteSubtaskForUser,
  deleteTaskForUser,
  findActiveApiTokenByRawToken,
  getDashboardSnapshot,
  getBoardSnapshot,
  getShellSnapshot,
  listApiTokens,
  listInvitations,
  markTaskDoneForUser,
  MAX_BOARDS_PER_USER,
  MAX_TASKS_PER_BOARD,
  provisionDemoUser,
  purgeExpiredDemoUsers,
  reorderBoardsForUser,
  reorderDashboardInProgressForUser,
  reorderSubtasksForUser,
  reorderTasksForUser,
  resetPasswordWithToken,
  revokeApiToken,
  revokeInvitation,
  rolloverDueRecurringTasks,
  updateBoardForUser,
  updateChecklistItemForUser,
  updateSubtaskForUser,
  updateTaskFieldsForUser,
  updateTaskForUser,
} from "@/lib/data";
import { prisma } from "@/lib/db";
import { buildExternalDailySummary } from "@/lib/external-api";
import {
  labelColorPalette,
  MAX_ATTACHMENTS_PER_TASK,
  MAX_CHECKLIST_ITEMS_PER_TASK,
  MAX_LABELS_PER_TASK,
  starterBoard,
} from "@/lib/domain";
import { removeStorageObject } from "@/lib/storage";
import { createTestBoard, createTestUser, resetDatabase } from "./helpers/database";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function captureOutcome<T>(operation: () => Promise<T>) {
  try {
    return { status: "fulfilled" as const, value: await operation() };
  } catch (reason) {
    return { reason, status: "rejected" as const };
  }
}

function errorDetails(reason: unknown) {
  if (!(reason instanceof Error)) {
    return { code: undefined, message: String(reason) };
  }

  return {
    code: "code" in reason && typeof reason.code === "string" ? reason.code : undefined,
    message: reason.message,
  };
}

const defaultReadApiTokenScopes = [
  ApiTokenScope.BOARDS_READ,
  ApiTokenScope.TASKS_READ,
  ApiTokenScope.SUBTASKS_READ,
];

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

function attachmentInput(taskId: string, overrides: Partial<{
  contentType: string;
  fileName: string;
  size: number;
  storagePath: string;
}> = {}) {
  return {
    contentType: "application/pdf",
    fileName: "Launch plan.pdf",
    size: 1024,
    storagePath: `tasks/${taskId}/${randomUUID()}`,
    ...overrides,
  };
}

const taskSubtasksInclude = {
  subtasks: {
    orderBy: {
      sortOrder: "asc" as const,
    },
  },
};

function boardTasksWithSubtasks(boardId: string) {
  return prisma.task.findMany({
    where: { boardId },
    include: taskSubtasksInclude,
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });
}

function createDataTask({
  boardId,
  completedAt = null,
  dueDate,
  visibleAt = null,
  createdAt,
  updatedAt,
  dashboardSortOrder,
  description = null,
  id = randomUUID(),
  sortOrder = 0,
  status = PrismaTaskStatus.ON_DECK,
  title = "Task",
}: {
  boardId: string;
  completedAt?: Date | null;
  dueDate?: Date | null;
  visibleAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  dashboardSortOrder?: number | null;
  description?: string | null;
  id?: string;
  sortOrder?: number;
  status?: PrismaTaskStatus;
  title?: string;
}) {
  return prisma.task.create({
    data: {
      boardId,
      completedAt,
      ...(dueDate ? { dueDate } : {}),
      visibleAt,
      dashboardSortOrder,
      description,
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      id,
      sortOrder,
      status,
      title,
    },
  });
}

const rolloverReferenceDate = new Date("2026-07-08T00:00:00.000Z");

function utcDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function createRolloverTask({
  archivedAt = null,
  boardId,
  completedAt = null,
  dueDate,
  recurrence,
  sortOrder = 0,
  status,
  subtasks = [],
  title = "Recurring task",
  visibleAt = null,
}: {
  archivedAt?: Date | null;
  boardId: string;
  completedAt?: Date | null;
  dueDate: Date | null;
  recurrence: PrismaRecurrencePattern;
  sortOrder?: number;
  status: PrismaTaskStatus;
  subtasks?: Array<{ isComplete: boolean; title: string }>;
  title?: string;
  visibleAt?: Date | null;
}) {
  return prisma.task.create({
    data: {
      archivedAt,
      boardId,
      completedAt,
      description: null,
      dueDate,
      id: randomUUID(),
      priority: PrismaItemPriority.NONE,
      recurrence,
      sortOrder,
      status,
      title,
      visibleAt,
      subtasks: {
        create: subtasks.map((subtask, index) => ({
          id: randomUUID(),
          isComplete: subtask.isComplete,
          sortOrder: index,
          title: subtask.title,
        })),
      },
    },
    include: taskSubtasksInclude,
  });
}

describe("src/lib/data.ts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetDatabase();
  });

  test("creates a task and subtasks through the Serializable task transaction", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: "",
      dueDate: "2026-05-05",
      priority: "HIGH",
      recurrence: "NONE",
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
      recurrence: "NONE",
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

  test("persists and serializes non-default task recurrence", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "MONTHLY",
      status: "ON_DECK",
      subtasks: [],
      title: "Review budget",
    });

    expect(task.recurrence).toBe("MONTHLY");
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { recurrence: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({ recurrence: "MONTHLY" });
  });

  test("persists and serializes bi-weekly task recurrence", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "BI_WEEKLY",
      status: "ON_DECK",
      subtasks: [],
      title: "Review roadmap",
    });

    expect(task.recurrence).toBe("BI_WEEKLY");
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { recurrence: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({ recurrence: "BI_WEEKLY" });
  });

  test("advanceDueDate covers every recurrence cadence", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(advanceDueDate(base, PrismaRecurrencePattern.NONE).toISOString()).toBe(base.toISOString());
    expect(advanceDueDate(base, PrismaRecurrencePattern.DAILY).toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect(advanceDueDate(base, PrismaRecurrencePattern.WEEKLY).toISOString()).toBe("2026-01-08T00:00:00.000Z");
    expect(advanceDueDate(base, PrismaRecurrencePattern.BI_WEEKLY).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(advanceDueDate(base, PrismaRecurrencePattern.MONTHLY).toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(advanceDueDate(base, PrismaRecurrencePattern.SEMI_ANNUALLY).toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(advanceDueDate(base, PrismaRecurrencePattern.ANNUALLY).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("rolls over a stale daily in-progress recurring task", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const task = await createRolloverTask({
      boardId: board.id,
      dueDate: utcDate("2026-07-01"),
      recurrence: PrismaRecurrencePattern.DAILY,
      sortOrder: 3,
      status: PrismaTaskStatus.IN_PROGRESS,
    });

    const result = await rolloverDueRecurringTasks(rolloverReferenceDate);

    expect(result.rolledOverTaskIds).toEqual([task.id]);
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { dueDate: true, sortOrder: true, status: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({
      dueDate: rolloverReferenceDate,
      sortOrder: 3,
      status: PrismaTaskStatus.IN_PROGRESS,
    });
  });

  test("revives a completed weekly recurring task when its cycle has elapsed", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const task = await createRolloverTask({
      boardId: board.id,
      completedAt: utcDate("2026-07-02"),
      dueDate: utcDate("2026-07-01"),
      recurrence: PrismaRecurrencePattern.WEEKLY,
      status: PrismaTaskStatus.DONE,
    });

    const result = await rolloverDueRecurringTasks(rolloverReferenceDate);

    expect(result.rolledOverTaskIds).toEqual([task.id]);
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { completedAt: true, dueDate: true, status: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({
      completedAt: null,
      dueDate: rolloverReferenceDate,
      status: PrismaTaskStatus.IN_PROGRESS,
    });
  });

  test("revives an archived monthly recurring task when its cycle has elapsed", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const task = await createRolloverTask({
      archivedAt: utcDate("2026-05-09"),
      boardId: board.id,
      dueDate: utcDate("2026-05-08"),
      recurrence: PrismaRecurrencePattern.MONTHLY,
      status: PrismaTaskStatus.ARCHIVED,
    });

    const result = await rolloverDueRecurringTasks(rolloverReferenceDate);

    expect(result.rolledOverTaskIds).toEqual([task.id]);
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { archivedAt: true, dueDate: true, status: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({
      archivedAt: null,
      dueDate: rolloverReferenceDate,
      status: PrismaTaskStatus.IN_PROGRESS,
    });
  });

  test("leaves a monthly recurring task untouched until the next monthly cycle is due", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const task = await createRolloverTask({
      completedAt: utcDate("2026-07-01"),
      boardId: board.id,
      dueDate: utcDate("2026-07-01"),
      recurrence: PrismaRecurrencePattern.MONTHLY,
      status: PrismaTaskStatus.DONE,
    });

    const result = await rolloverDueRecurringTasks(rolloverReferenceDate);

    expect(result.rolledOverTaskIds).toEqual([]);
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { dueDate: true, status: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({
      dueDate: utcDate("2026-07-01"),
      status: PrismaTaskStatus.DONE,
    });
  });

  test("leaves non-recurring stale tasks untouched", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const task = await createRolloverTask({
      completedAt: utcDate("2026-01-02"),
      boardId: board.id,
      dueDate: utcDate("2026-01-01"),
      recurrence: PrismaRecurrencePattern.NONE,
      status: PrismaTaskStatus.DONE,
    });

    const result = await rolloverDueRecurringTasks(rolloverReferenceDate);

    expect(result.rolledOverTaskIds).toEqual([]);
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { completedAt: true, dueDate: true, status: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({
      completedAt: utcDate("2026-01-02"),
      dueDate: utcDate("2026-01-01"),
      status: PrismaTaskStatus.DONE,
    });
  });

  test("leaves recurring tasks without a due date untouched", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const task = await createRolloverTask({
      boardId: board.id,
      dueDate: null,
      recurrence: PrismaRecurrencePattern.DAILY,
      status: PrismaTaskStatus.DONE,
    });

    const result = await rolloverDueRecurringTasks(rolloverReferenceDate);

    expect(result.rolledOverTaskIds).toEqual([]);
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { dueDate: true, status: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({
      dueDate: null,
      status: PrismaTaskStatus.DONE,
    });
  });

  test("resets all subtasks for rolled-over recurring tasks", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const task = await createRolloverTask({
      boardId: board.id,
      dueDate: utcDate("2026-07-01"),
      recurrence: PrismaRecurrencePattern.DAILY,
      status: PrismaTaskStatus.DONE,
      subtasks: [
        { isComplete: true, title: "Already complete" },
        { isComplete: false, title: "Still open" },
      ],
    });

    await rolloverDueRecurringTasks(rolloverReferenceDate);

    await expect(
      prisma.subtask.findMany({
        orderBy: { sortOrder: "asc" },
        select: { isComplete: true },
        where: { taskId: task.id },
      }),
    ).resolves.toEqual([{ isComplete: false }, { isComplete: false }]);
  });

  test("appends rolled-over tasks to the in-progress sort order without collisions", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    await createRolloverTask({
      boardId: board.id,
      dueDate: null,
      recurrence: PrismaRecurrencePattern.NONE,
      sortOrder: 4,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Existing in progress",
    });
    const first = await createRolloverTask({
      boardId: board.id,
      dueDate: utcDate("2026-07-01"),
      recurrence: PrismaRecurrencePattern.DAILY,
      sortOrder: 0,
      status: PrismaTaskStatus.DONE,
      title: "First due task",
    });
    const second = await createRolloverTask({
      archivedAt: utcDate("2026-07-02"),
      boardId: board.id,
      dueDate: utcDate("2026-07-01"),
      recurrence: PrismaRecurrencePattern.DAILY,
      sortOrder: 1,
      status: PrismaTaskStatus.ARCHIVED,
      title: "Second due task",
    });

    await rolloverDueRecurringTasks(rolloverReferenceDate);

    const updated = await prisma.task.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true, status: true },
      where: { id: { in: [first.id, second.id] } },
    });

    expect(updated.map((task) => task.status)).toEqual([
      PrismaTaskStatus.IN_PROGRESS,
      PrismaTaskStatus.IN_PROGRESS,
    ]);
    expect(updated.map((task) => task.sortOrder)).toEqual([5, 6]);
  });

  test("rolloverDueRecurringTasks is idempotent for the same reference date", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const task = await createRolloverTask({
      boardId: board.id,
      dueDate: utcDate("2026-07-01"),
      recurrence: PrismaRecurrencePattern.DAILY,
      status: PrismaTaskStatus.DONE,
    });

    const first = await rolloverDueRecurringTasks(rolloverReferenceDate);
    const second = await rolloverDueRecurringTasks(rolloverReferenceDate);

    expect(first.rolledOverTaskIds).toEqual([task.id]);
    expect(second.rolledOverTaskIds).toEqual([]);
  });

  test("rolls over due recurring tasks across users and boards", async () => {
    const firstUser = await createTestUser({ email: "first@example.test" });
    const firstBoard = await createTestBoard(firstUser.id);
    const secondUser = await createTestUser({ email: "second@example.test" });
    const secondBoard = await createTestBoard(secondUser.id);
    const firstTask = await createRolloverTask({
      boardId: firstBoard.id,
      dueDate: utcDate("2026-07-01"),
      recurrence: PrismaRecurrencePattern.DAILY,
      status: PrismaTaskStatus.DONE,
    });
    const secondTask = await createRolloverTask({
      boardId: secondBoard.id,
      dueDate: utcDate("2026-06-24"),
      recurrence: PrismaRecurrencePattern.WEEKLY,
      status: PrismaTaskStatus.ARCHIVED,
    });

    const result = await rolloverDueRecurringTasks(rolloverReferenceDate);

    expect(new Set(result.rolledOverTaskIds)).toEqual(new Set([firstTask.id, secondTask.id]));
    await expect(
      prisma.task.count({
        where: {
          id: { in: [firstTask.id, secondTask.id] },
          status: PrismaTaskStatus.IN_PROGRESS,
        },
      }),
    ).resolves.toBe(2);
  });

  test("updates task recurrence", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Refresh roadmap",
    });

    const updatedTask = await updateTaskForUser(user.id, task.id, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "WEEKLY",
      status: "ON_DECK",
      subtasks: [],
      title: "Refresh roadmap",
    });

    expect(updatedTask.recurrence).toBe("WEEKLY");
    await expect(
      prisma.task.findUniqueOrThrow({
        select: { recurrence: true },
        where: { id: task.id },
      }),
    ).resolves.toEqual({ recurrence: "WEEKLY" });
  });

  test("adds a new subtask without an id when updating a task", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Add a launch step",
    });

    const updatedTask = await updateTaskForUser(user.id, task.id, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [{ isComplete: false, title: "Confirm the launch owner" }],
      title: task.title,
    });

    expect(updatedTask.subtasks).toEqual([
      expect.objectContaining({
        isComplete: false,
        title: "Confirm the launch owner",
      }),
    ]);
    expect(updatedTask.subtasks[0]?.id).toEqual(expect.any(String));
  });

  test("preserves a due date when updating another task field", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: "2026-05-05",
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Keep the launch date",
    });

    const updatedTask = await updateTaskFieldsForUser(user.id, task.id, {
      title: "Keep the confirmed launch date",
    });

    expect(updatedTask).toMatchObject({
      dueDate: "2026-05-05T00:00:00.000Z",
      title: "Keep the confirmed launch date",
    });
  });

  test("updates a subtask title without changing its completion state", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [{ isComplete: false, title: "Original step" }],
      title: "Rename a launch step",
    });
    const subtaskId = task.subtasks[0]?.id;
    if (!subtaskId) {
      throw new Error("Expected a serialized subtask id.");
    }

    const updatedTask = await updateSubtaskForUser(user.id, subtaskId, {
      title: "Renamed step",
    });

    expect(updatedTask.subtasks).toEqual([
      expect.objectContaining({
        id: subtaskId,
        isComplete: false,
        title: "Renamed step",
      }),
    ]);
  });

  test("keeps parent-task guards unreachable during a concurrent task deletion", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [{ isComplete: false, title: "Race the parent deletion" }],
      title: "Parent deletion race",
    });
    const subtaskId = task.subtasks[0]?.id;
    if (!subtaskId) {
      throw new Error("Expected a serialized subtask id.");
    }

    const [taskDeletion, subtaskUpdate] = await Promise.all([
      captureOutcome(() => deleteTaskForUser(user.id, task.id)),
      captureOutcome(() => updateSubtaskForUser(user.id, subtaskId, { isComplete: true })),
    ]);

    expect(taskDeletion.status).toBe("fulfilled");
    if (taskDeletion.status === "rejected") {
      throw taskDeletion.reason;
    }

    // This protects the six parent-task pragmas: changing cascade behavior must not
    // let a child mutation continue far enough to throw "Task not found." instead.
    if (subtaskUpdate.status === "rejected") {
      expect(errorDetails(subtaskUpdate.reason).message).toBe("Subtask not found.");
    } else {
      expect(subtaskUpdate.value.subtasks).toEqual([
        expect.objectContaining({ id: subtaskId, isComplete: true }),
      ]);
    }

    const [persistedTask, persistedSubtask] = await Promise.all([
      prisma.task.findUnique({ where: { id: task.id } }),
      prisma.subtask.findUnique({ where: { id: subtaskId } }),
    ]);
    expect(persistedTask).toBeNull();
    expect(persistedSubtask).toBeNull();
  });

  test("never turns a concurrent subtask deletion into a silent reorder miss", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [
        { isComplete: false, title: "Delete during reorder" },
        { isComplete: false, title: "Keep during reorder" },
      ],
      title: "Subtask reorder race",
    });
    const [deletedSubtask, keptSubtask] = task.subtasks;
    if (!deletedSubtask || !keptSubtask) {
      throw new Error("Expected two serialized subtasks.");
    }

    const [reorder, deletion] = await Promise.all([
      captureOutcome(() =>
        reorderSubtasksForUser(user.id, task.id, {
          subtaskIds: [keptSubtask.id, deletedSubtask.id],
        }),
      ),
      captureOutcome(() => deleteSubtaskForUser(user.id, deletedSubtask.id)),
    ]);

    expect(deletion.status).toBe("fulfilled");
    if (deletion.status === "rejected") {
      throw deletion.reason;
    }

    // This protects the line-1870 pragma: after payload validation, Serializable
    // isolation must produce success or a write conflict, never a zero-row update.
    if (reorder.status === "rejected") {
      const { code, message } = errorDetails(reorder.reason);
      expect(message).not.toBe("Reorder payload does not match the task's subtasks.");
      expect(code === "P2034" || /write conflict|serialization failure/i.test(message)).toBe(true);
    } else {
      expect(reorder.value.subtasks.map((subtask) => subtask.id)).toEqual([
        keptSubtask.id,
        deletedSubtask.id,
      ]);
    }

    const [persistedTask, persistedDeletedSubtask, persistedKeptSubtask] = await Promise.all([
      prisma.task.findUnique({ where: { id: task.id } }),
      prisma.subtask.findUnique({ where: { id: deletedSubtask.id } }),
      prisma.subtask.findUnique({ where: { id: keptSubtask.id } }),
    ]);
    expect(persistedTask).not.toBeNull();
    expect(persistedDeletedSubtask).toBeNull();
    expect(persistedKeptSubtask).not.toBeNull();
  });

  test("archives a task while keeping its completion date clear", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Archive project notes",
    });

    const archivedTask = await updateTaskForUser(user.id, task.id, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ARCHIVED",
      subtasks: [],
      title: "Archive project notes",
    });

    expect(archivedTask.archivedAt).not.toBeNull();
    expect(archivedTask.completedAt).toBeNull();
  });

  test("removes subtasks omitted from a task update", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [
        { isComplete: false, title: "Keep this step" },
        { isComplete: false, title: "Remove this step" },
      ],
      title: "Trim the checklist",
    });
    const [keptSubtask, omittedSubtask] = task.subtasks;

    if (!keptSubtask || !omittedSubtask) {
      throw new Error("Expected two serialized subtasks.");
    }

    const updatedTask = await updateTaskForUser(user.id, task.id, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [
        {
          id: keptSubtask.id,
          isComplete: keptSubtask.isComplete,
          title: keptSubtask.title,
        },
      ],
      title: "Trim the checklist",
    });

    expect(updatedTask.subtasks.map((subtask) => subtask.id)).toEqual([keptSubtask.id]);
    await expect(
      prisma.subtask.findUnique({ where: { id: omittedSubtask.id } }),
    ).resolves.toBeNull();
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

  test("rejects board names that produce an empty URL slug", async () => {
    const user = await createTestUser();

    await expect(
      createBoardForUser(user.id, {
        description: null,
        iconKey: starterBoard.iconKey,
        name: "!!!",
      }),
    ).rejects.toThrow("Board name must produce a valid URL slug.");
  });

  test("persists board accent colors through create, update, and shell snapshot", async () => {
    const user = await createTestUser();

    const board = await createBoardForUser(user.id, {
      accentColor: "#4f78e6",
      description: null,
      iconKey: starterBoard.iconKey,
      name: "Accent Lab",
    });

    expect(board).toMatchObject({
      accentColor: "#4f78e6",
      slug: "accent-lab",
    });
    await expect(
      prisma.board.findUniqueOrThrow({
        select: { accentColor: true },
        where: { userId_slug: { userId: user.id, slug: board.slug } },
      }),
    ).resolves.toEqual({ accentColor: "#4f78e6" });

    const { updated } = await updateBoardForUser(user.id, board.slug, {
      accentColor: "#2f9f85",
      description: null,
    });

    expect(updated.accentColor).toBe("#2f9f85");
    await expect(getShellSnapshot(user.id)).resolves.toMatchObject({
      boards: [
        {
          accentColor: "#2f9f85",
          slug: board.slug,
        },
      ],
    });
  });

  test("getShellSnapshot flags demo accounts via isDemo", async () => {
    const realUser = await createTestUser();
    const demo = await provisionDemoUser();

    await expect(getShellSnapshot(realUser.id)).resolves.toMatchObject({
      user: { isDemo: false },
    });
    await expect(getShellSnapshot(demo.id)).resolves.toMatchObject({
      user: { isDemo: true },
    });
  });

  test("getShellSnapshot returns null for a nonexistent user", async () => {
    await expect(getShellSnapshot(randomUUID())).resolves.toBeNull();
  });

  test("includes board accent colors in dashboard snapshot breakdown", async () => {
    const user = await createTestUser();
    const coloredBoard = await createBoardForUser(user.id, {
      accentColor: "#4f78e6",
      description: null,
      iconKey: starterBoard.iconKey,
      name: "Colored board",
    });
    const fallbackBoard = await createBoardForUser(user.id, {
      description: null,
      iconKey: starterBoard.iconKey,
      name: "Fallback board",
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(
      snapshot.boardBreakdown.find((board) => board.slug === coloredBoard.slug),
    ).toMatchObject({ accentColor: "#4f78e6" });
    expect(
      snapshot.boardBreakdown.find((board) => board.slug === fallbackBoard.slug),
    ).toMatchObject({ accentColor: null });
  });

  test("includes the caller's own active tokens, most-recently-used first, excluding revoked and expired", async () => {
    const user = await createTestUser();
    const otherUser = await createTestUser({ email: "other-tokens@example.test" });
    const now = new Date();

    await prisma.apiToken.create({
      data: {
        createdById: user.id,
        id: randomUUID(),
        label: "Recently used",
        lastUsedAt: subDays(now, 1),
        prefix: "wbat_recent",
        scopes: [ApiTokenScope.TASKS_READ],
        tokenHash: sha256("recent-token"),
      },
    });
    await prisma.apiToken.create({
      data: {
        createdById: user.id,
        id: randomUUID(),
        label: "Never used",
        prefix: "wbat_unused",
        scopes: [ApiTokenScope.BOARDS_READ],
        tokenHash: sha256("unused-token"),
      },
    });
    await prisma.apiToken.create({
      data: {
        createdById: user.id,
        id: randomUUID(),
        label: "Revoked",
        prefix: "wbat_revoked",
        revokedAt: now,
        scopes: [ApiTokenScope.TASKS_READ],
        tokenHash: sha256("revoked-token"),
      },
    });
    await prisma.apiToken.create({
      data: {
        createdById: user.id,
        expiresAt: subDays(now, 1),
        id: randomUUID(),
        label: "Expired",
        prefix: "wbat_expired",
        scopes: [ApiTokenScope.TASKS_READ],
        tokenHash: sha256("expired-token"),
      },
    });
    await prisma.apiToken.create({
      data: {
        createdById: otherUser.id,
        id: randomUUID(),
        label: "Someone else's token",
        prefix: "wbat_other",
        scopes: [ApiTokenScope.TASKS_READ],
        tokenHash: sha256("other-user-token"),
      },
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(snapshot.activeTokens.map((token) => token.label)).toEqual([
      "Recently used",
      "Never used",
    ]);
  });

  test("sorts a used dashboard token ahead of two never-used tokens", async () => {
    const user = await createTestUser();

    await prisma.apiToken.createMany({
      data: [
        {
          createdById: user.id,
          id: randomUUID(),
          label: "Never used first",
          prefix: "wbat_unused_1",
          scopes: [ApiTokenScope.BOARDS_READ],
          tokenHash: sha256("unused-token-1"),
        },
        {
          createdById: user.id,
          id: randomUUID(),
          label: "Used",
          lastUsedAt: new Date("2026-08-01T00:00:00.000Z"),
          prefix: "wbat_used",
          scopes: [ApiTokenScope.TASKS_READ],
          tokenHash: sha256("used-token"),
        },
        {
          createdById: user.id,
          id: randomUUID(),
          label: "Never used second",
          prefix: "wbat_unused_2",
          scopes: [ApiTokenScope.SUBTASKS_READ],
          tokenHash: sha256("unused-token-2"),
        },
      ],
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(snapshot.activeTokens[0]?.label).toBe("Used");
    expect(new Set(snapshot.activeTokens.slice(1).map((token) => token.label))).toEqual(
      new Set(["Never used first", "Never used second"]),
    );
  });

  test("ranks board health by overdue count then open count, excluding caught-up boards", async () => {
    const user = await createTestUser();
    const [busyBoard, quietBoard, caughtUpBoard] = boardRows(user.id, 3);
    await prisma.board.createMany({ data: [busyBoard, quietBoard, caughtUpBoard] });

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    await createDataTask({
      boardId: busyBoard.id,
      dueDate: yesterday,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Overdue in busy board",
    });
    await createDataTask({
      boardId: busyBoard.id,
      status: PrismaTaskStatus.ON_DECK,
      title: "Open in busy board",
    });
    await createDataTask({
      boardId: quietBoard.id,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Open in quiet board",
    });
    await createDataTask({
      boardId: caughtUpBoard.id,
      status: PrismaTaskStatus.DONE,
      title: "Already done",
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(snapshot.boardHealth.map((board) => board.slug)).toEqual([
      busyBoard.slug,
      quietBoard.slug,
    ]);
    expect(snapshot.boardHealth.find((board) => board.slug === busyBoard.slug)).toMatchObject({
      openCount: 2,
      overdueCount: 1,
    });
  });

  test("includes board accent colors on dashboard in-progress task summaries", async () => {
    const user = await createTestUser();
    const coloredBoard = await createBoardForUser(user.id, {
      accentColor: "#4f78e6",
      description: null,
      iconKey: starterBoard.iconKey,
      name: "Colored board",
    });
    const fallbackBoard = await createBoardForUser(user.id, {
      description: null,
      iconKey: starterBoard.iconKey,
      name: "Fallback board",
    });
    const [coloredBoardRecord, fallbackBoardRecord] = await Promise.all([
      prisma.board.findUniqueOrThrow({
        select: { id: true },
        where: { userId_slug: { userId: user.id, slug: coloredBoard.slug } },
      }),
      prisma.board.findUniqueOrThrow({
        select: { id: true },
        where: { userId_slug: { userId: user.id, slug: fallbackBoard.slug } },
      }),
    ]);
    await createDataTask({
      boardId: coloredBoardRecord.id,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Colored in-progress",
    });
    await createDataTask({
      boardId: fallbackBoardRecord.id,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Fallback in-progress",
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(
      snapshot.inProgressTasks.find((task) => task.boardSlug === coloredBoard.slug),
    ).toMatchObject({ boardAccentColor: "#4f78e6" });
    expect(
      snapshot.inProgressTasks.find((task) => task.boardSlug === fallbackBoard.slug),
    ).toMatchObject({ boardAccentColor: null });
  });

  test("includes stale open tasks untouched for 14+ days, most stale first", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const now = new Date();
    const veryStaleTaskId = randomUUID();
    const staleTaskId = randomUUID();
    const freshTaskId = randomUUID();

    await createDataTask({
      boardId: board.id,
      id: veryStaleTaskId,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Untouched for a month",
      updatedAt: subDays(now, 30),
    });
    await createDataTask({
      boardId: board.id,
      id: staleTaskId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Untouched for two weeks",
      updatedAt: subDays(now, 15),
    });
    await createDataTask({
      boardId: board.id,
      id: freshTaskId,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Touched yesterday",
      updatedAt: subDays(now, 1),
    });
    await createDataTask({
      boardId: board.id,
      status: PrismaTaskStatus.DONE,
      title: "Done and untouched for ages",
      updatedAt: subDays(now, 60),
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(snapshot.staleTasks.map((task) => task.id)).toEqual([veryStaleTaskId, staleTaskId]);
  });

  test("hides tasks with a future visibleAt from the board snapshot", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    await createDataTask({ boardId: board.id, title: "Visible now", visibleAt: null });
    await createDataTask({
      boardId: board.id,
      title: "Hidden until later",
      visibleAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    const snapshot = await getBoardSnapshot(user.id, board.slug);

    const titles = snapshot!.tasks.map((task) => task.title);
    expect(titles).toContain("Visible now");
    expect(titles).not.toContain("Hidden until later");
  });

  test("hides tasks with a future visibleAt from the dashboard snapshot", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    await createDataTask({
      boardId: board.id,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Active now",
      visibleAt: null,
    });
    await createDataTask({
      boardId: board.id,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Hidden recurring",
      visibleAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    const snapshot = await getDashboardSnapshot(user.id);

    const titles = snapshot.inProgressTasks.map((task) => task.title);
    expect(titles).toContain("Active now");
    expect(titles).not.toContain("Hidden recurring");
  });

  test("hides tasks with a future visibleAt from the external daily summary", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    await createDataTask({
      boardId: board.id,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Briefing visible",
      visibleAt: null,
    });
    await createDataTask({
      boardId: board.id,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Briefing hidden",
      visibleAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    const summary = await buildExternalDailySummary(user.id);

    const titles = summary.inProgress.map((task) => task.title);
    expect(titles).toContain("Briefing visible");
    expect(titles).not.toContain("Briefing hidden");
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
        recurrence: "NONE",
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
        recurrence: "NONE",
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

  test("creates, serializes, and deletes task labels", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Label-ready task",
    });

    const labeledTask = await createLabelForTask(user.id, task.id, {
      color: labelColorPalette[5],
      text: "Customer",
    });

    expect(labeledTask.labels).toEqual([
      expect.objectContaining({
        color: labelColorPalette[5],
        sortOrder: 0,
        text: "Customer",
      }),
    ]);
    await expect(
      prisma.taskLabel.findFirstOrThrow({
        select: {
          color: true,
          text: true,
        },
        where: { taskId: task.id },
      }),
    ).resolves.toEqual({
      color: labelColorPalette[5],
      text: "Customer",
    });

    const snapshot = await getBoardSnapshot(user.id, starterBoard.slug);
    expect(snapshot?.tasks[0]?.labels).toEqual([
      expect.objectContaining({
        color: labelColorPalette[5],
        sortOrder: 0,
        text: "Customer",
      }),
    ]);

    const labelId = labeledTask.labels?.[0]?.id;
    if (!labelId) {
      throw new Error("Expected a serialized label id.");
    }

    const deletedTask = await deleteLabelForUser(user.id, labelId);

    expect(deletedTask.labels).toEqual([]);
    await expect(prisma.taskLabel.findUnique({ where: { id: labelId } })).resolves.toBeNull();
  });

  test("appends new labels after the highest existing sort order", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Multi-label task",
    });

    await createLabelForTask(user.id, task.id, {
      color: labelColorPalette[0],
      text: "First",
    });
    const labeledTask = await createLabelForTask(user.id, task.id, {
      color: labelColorPalette[1],
      text: "Second",
    });

    expect(labeledTask.labels?.find((label) => label.text === "Second")?.sortOrder).toBe(1);
  });

  test("enforces the task label cap", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Label-capped task",
    });

    await prisma.taskLabel.createMany({
      data: Array.from({ length: MAX_LABELS_PER_TASK }, (_, sortOrder) => ({
        color: labelColorPalette[sortOrder % labelColorPalette.length],
        id: randomUUID(),
        sortOrder,
        taskId: task.id,
        text: `Label ${sortOrder}`,
      })),
    });

    await expect(
      createLabelForTask(user.id, task.id, {
        color: labelColorPalette[0],
        text: "Too many",
      }),
    ).rejects.toThrow("Tasks can include up to 10 labels.");
  });

  test("creates, persists, and serializes task checklist items", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Checklist-ready task",
    });

    const checklistTask = await createChecklistItemForTask(user.id, task.id, {
      text: "Confirm launch owner",
    });

    expect(checklistTask.checklist).toEqual([
      expect.objectContaining({
        isComplete: false,
        sortOrder: 0,
        text: "Confirm launch owner",
      }),
    ]);
    await expect(
      prisma.checklistItem.findFirstOrThrow({
        select: {
          isComplete: true,
          text: true,
        },
        where: { taskId: task.id },
      }),
    ).resolves.toEqual({
      isComplete: false,
      text: "Confirm launch owner",
    });

    const snapshot = await getBoardSnapshot(user.id, starterBoard.slug);
    expect(snapshot?.tasks[0]?.checklist).toEqual([
      expect.objectContaining({
        isComplete: false,
        sortOrder: 0,
        text: "Confirm launch owner",
      }),
    ]);
  });

  test("creates attachment records without exposing storage paths", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Attachment-ready task",
    });
    const input = attachmentInput(task.id);

    const attachedTask = await createAttachmentRecord(user.id, task.id, input);

    expect(attachedTask.attachments).toEqual([
      expect.objectContaining({
        contentType: input.contentType,
        fileName: input.fileName,
        size: input.size,
      }),
    ]);
    expect(attachedTask.attachments?.[0]).not.toHaveProperty("storagePath");
    await expect(
      prisma.attachment.findFirstOrThrow({
        select: {
          contentType: true,
          fileName: true,
          size: true,
          storagePath: true,
        },
        where: { taskId: task.id },
      }),
    ).resolves.toEqual({
      contentType: input.contentType,
      fileName: input.fileName,
      size: input.size,
      storagePath: input.storagePath,
    });

    const snapshot = await getBoardSnapshot(user.id, starterBoard.slug);
    expect(snapshot?.tasks[0]?.attachments).toEqual([
      expect.objectContaining({
        contentType: input.contentType,
        fileName: input.fileName,
        size: input.size,
      }),
    ]);
    expect(snapshot?.tasks[0]?.attachments?.[0]).not.toHaveProperty("storagePath");
  });

  test("enforces the task attachment cap", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Attachment-capped task",
    });

    await prisma.attachment.createMany({
      data: Array.from({ length: MAX_ATTACHMENTS_PER_TASK }, (_, index) => ({
        contentType: "application/pdf",
        fileName: `Attachment ${index}.pdf`,
        id: randomUUID(),
        size: 1024,
        storagePath: `tasks/${task.id}/${randomUUID()}`,
        taskId: task.id,
      })),
    });

    await expect(
      createAttachmentRecord(user.id, task.id, attachmentInput(task.id)),
    ).rejects.toThrow("Tasks can include up to 10 attachments.");
  });

  test("rejects attachment records outside the task storage prefix", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Attachment path task",
    });

    await expect(
      createAttachmentRecord(
        user.id,
        task.id,
        attachmentInput(task.id, { storagePath: `tasks/${randomUUID()}/${randomUUID()}` }),
      ),
    ).rejects.toThrow("Attachment storage path is invalid.");
    await expect(prisma.attachment.count()).resolves.toBe(0);
  });

  test("deletes attachment records and removes the storage object", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Attachment delete task",
    });
    const input = attachmentInput(task.id);
    const attachedTask = await createAttachmentRecord(user.id, task.id, input);
    const attachmentId = attachedTask.attachments?.[0]?.id;
    if (!attachmentId) {
      throw new Error("Expected a serialized attachment id.");
    }

    const deletedTask = await deleteAttachmentForUser(user.id, attachmentId);

    expect(deletedTask.attachments).toEqual([]);
    expect(removeStorageObject).toHaveBeenCalledWith(input.storagePath);
    await expect(prisma.attachment.findUnique({ where: { id: attachmentId } })).resolves.toBeNull();
  });

  test("keeps the attachment parent guard unreachable during concurrent task deletion", async () => {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const user = await createTestUser({
        email: `attachment-race-${iteration}@example.test`,
      });
      await createTestBoard(user.id);
      const task = await createTaskForBoard(user.id, starterBoard.slug, {
        description: null,
        dueDate: null,
        priority: "NONE",
        recurrence: "NONE",
        status: "ON_DECK",
        subtasks: [],
        title: `Attachment parent race ${iteration}`,
      });
      const attachedTask = await createAttachmentRecord(
        user.id,
        task.id,
        attachmentInput(task.id),
      );
      const attachmentId = attachedTask.attachments?.[0]?.id;
      if (!attachmentId) {
        throw new Error("Expected a serialized attachment id.");
      }

      // Keep the suite's existing immediate async storage mock: it preserves the
      // natural await without artificially widening the pre-transaction window.
      const storageCallCount = vi.mocked(removeStorageObject).mock.calls.length;
      const [attachmentDeletion, taskDeletion] = await Promise.all([
        captureOutcome(() => deleteAttachmentForUser(user.id, attachmentId)),
        captureOutcome(() => deleteTaskForUser(user.id, task.id)),
      ]);
      const storageWasCalled = vi.mocked(removeStorageObject).mock.calls.length > storageCallCount;

      expect(taskDeletion.status).toBe("fulfilled");
      if (taskDeletion.status === "rejected") {
        throw taskDeletion.reason;
      }

      if (attachmentDeletion.status === "rejected") {
        const { message } = errorDetails(attachmentDeletion.reason);
        expect(message).not.toBe("Task not found.");
        expect(message).toBe("Attachment not found.");
      } else {
        expect(attachmentDeletion.value.attachments).toEqual([]);
        expect(storageWasCalled).toBe(true);
      }

      const [persistedTask, persistedAttachment] = await Promise.all([
        prisma.task.findUnique({ where: { id: task.id } }),
        prisma.attachment.findUnique({ where: { id: attachmentId } }),
      ]);
      expect(persistedTask).toBeNull();
      expect(persistedAttachment).toBeNull();
    }
  });

  test("allows only one concurrent deletion of the same attachment", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Attachment race task",
    });
    const attachedTask = await createAttachmentRecord(
      user.id,
      task.id,
      attachmentInput(task.id),
    );
    const attachmentId = attachedTask.attachments?.[0]?.id;
    if (!attachmentId) {
      throw new Error("Expected a serialized attachment id.");
    }

    const results = await Promise.allSettled([
      deleteAttachmentForUser(user.id, attachmentId),
      deleteAttachmentForUser(user.id, attachmentId),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toEqual(
      expect.objectContaining({ message: "Attachment not found." }),
    );
  });

  test("enforces the task checklist item cap", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Checklist-capped task",
    });

    await prisma.checklistItem.createMany({
      data: Array.from({ length: MAX_CHECKLIST_ITEMS_PER_TASK }, (_, sortOrder) => ({
        id: randomUUID(),
        isComplete: false,
        sortOrder,
        taskId: task.id,
        text: `Checklist item ${sortOrder}`,
      })),
    });

    await expect(
      createChecklistItemForTask(user.id, task.id, {
        text: "Too many",
      }),
    ).rejects.toThrow("Tasks can include up to 50 checklist items.");
  });

  test("updates task checklist item text and completion", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Checklist update task",
    });
    const checklistTask = await createChecklistItemForTask(user.id, task.id, {
      text: "Original item",
    });
    const itemId = checklistTask.checklist?.[0]?.id;
    if (!itemId) {
      throw new Error("Expected a serialized checklist item id.");
    }

    const updatedTask = await updateChecklistItemForUser(user.id, itemId, {
      isComplete: true,
      text: "Updated item",
    });

    expect(updatedTask.checklist).toEqual([
      expect.objectContaining({
        id: itemId,
        isComplete: true,
        text: "Updated item",
      }),
    ]);
    await expect(
      prisma.checklistItem.findUniqueOrThrow({
        select: {
          isComplete: true,
          text: true,
        },
        where: { id: itemId },
      }),
    ).resolves.toEqual({
      isComplete: true,
      text: "Updated item",
    });
  });

  test("updates checklist completion without changing its text", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Checklist completion task",
    });
    const checklistTask = await createChecklistItemForTask(user.id, task.id, {
      text: "Keep this text",
    });
    const itemId = checklistTask.checklist?.[0]?.id;
    if (!itemId) {
      throw new Error("Expected a serialized checklist item id.");
    }

    const updatedTask = await updateChecklistItemForUser(user.id, itemId, {
      isComplete: true,
    });

    expect(updatedTask.checklist).toEqual([
      expect.objectContaining({
        id: itemId,
        isComplete: true,
        text: "Keep this text",
      }),
    ]);
  });

  test("updates checklist text without changing its completion state", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Checklist text task",
    });
    const checklistTask = await createChecklistItemForTask(user.id, task.id, {
      text: "Original text",
    });
    const itemId = checklistTask.checklist?.[0]?.id;
    if (!itemId) {
      throw new Error("Expected a serialized checklist item id.");
    }

    const updatedTask = await updateChecklistItemForUser(user.id, itemId, {
      text: "Updated text only",
    });

    expect(updatedTask.checklist).toEqual([
      expect.objectContaining({
        id: itemId,
        isComplete: false,
        text: "Updated text only",
      }),
    ]);
  });

  test("deletes task checklist items", async () => {
    const user = await createTestUser();
    await createTestBoard(user.id);
    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Checklist delete task",
    });
    const firstTask = await createChecklistItemForTask(user.id, task.id, {
      text: "Remove me",
    });
    const secondTask = await createChecklistItemForTask(user.id, task.id, {
      text: "Keep me",
    });
    const removedId = firstTask.checklist?.[0]?.id;
    const retainedId = secondTask.checklist?.find((item) => item.text === "Keep me")?.id;
    if (!removedId || !retainedId) {
      throw new Error("Expected serialized checklist item ids.");
    }

    const deletedTask = await deleteChecklistItemForUser(user.id, removedId);

    expect(deletedTask.checklist).toEqual([
      expect.objectContaining({
        id: retainedId,
        text: "Keep me",
      }),
    ]);
    await expect(
      prisma.checklistItem.findUnique({ where: { id: removedId } }),
    ).resolves.toBeNull();
  });

  test("reorders tasks within a board", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const firstTaskId = randomUUID();
    const secondTaskId = randomUUID();
    const thirdTaskId = randomUUID();

    await createDataTask({ boardId: board.id, id: firstTaskId, title: "First task" });
    await createDataTask({
      boardId: board.id,
      id: secondTaskId,
      sortOrder: 1,
      title: "Second task",
    });
    await createDataTask({
      boardId: board.id,
      id: thirdTaskId,
      sortOrder: 2,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Third task",
    });

    await reorderTasksForUser(user.id, {
      items: [
        { sortOrder: 0, status: "DONE", taskId: thirdTaskId },
        { sortOrder: 1, status: "IN_PROGRESS", taskId: firstTaskId },
        { sortOrder: 2, status: "ON_DECK", taskId: secondTaskId },
      ],
    });

    const tasks = await prisma.task.findMany({
      select: {
        id: true,
        sortOrder: true,
        status: true,
      },
      where: {
        id: {
          in: [firstTaskId, secondTaskId, thirdTaskId],
        },
      },
    });

    expect(new Map(tasks.map((task) => [task.id, task]))).toEqual(
      new Map([
        [firstTaskId, { id: firstTaskId, sortOrder: 1, status: PrismaTaskStatus.IN_PROGRESS }],
        [secondTaskId, { id: secondTaskId, sortOrder: 2, status: PrismaTaskStatus.ON_DECK }],
        [thirdTaskId, { id: thirdTaskId, sortOrder: 0, status: PrismaTaskStatus.DONE }],
      ]),
    );
  });

  test("rejects reordering another user's task", async () => {
    const owner = await createTestUser({ email: "owner@example.test" });
    const otherUser = await createTestUser({ email: "other@example.test" });
    const ownerBoard = await createTestBoard(owner.id);
    const otherBoard = await createTestBoard(otherUser.id);
    const ownerTaskId = randomUUID();
    const otherTaskId = randomUUID();

    await createDataTask({ boardId: ownerBoard.id, id: ownerTaskId, title: "Owner task" });
    await createDataTask({ boardId: otherBoard.id, id: otherTaskId, title: "Other user's task" });

    await expect(
      reorderTasksForUser(owner.id, {
        items: [{ sortOrder: 9, status: "DONE", taskId: otherTaskId }],
      }),
    ).rejects.toThrow("One or more tasks could not be found.");

    await expect(
      prisma.task.findUniqueOrThrow({
        select: {
          sortOrder: true,
          status: true,
        },
        where: { id: otherTaskId },
      }),
    ).resolves.toEqual({
      sortOrder: 0,
      status: PrismaTaskStatus.ON_DECK,
    });
  });

  test("rejects reordering tasks spanning two boards", async () => {
    const user = await createTestUser();
    const [firstBoard, secondBoard] = boardRows(user.id, 2);
    const firstTaskId = randomUUID();
    const secondTaskId = randomUUID();

    await prisma.board.createMany({ data: [firstBoard, secondBoard] });
    await createDataTask({ boardId: firstBoard.id, id: firstTaskId, title: "First board task" });
    await createDataTask({ boardId: secondBoard.id, id: secondTaskId, title: "Second board task" });

    await expect(
      reorderTasksForUser(user.id, {
        items: [
          { sortOrder: 0, status: "IN_PROGRESS", taskId: firstTaskId },
          { sortOrder: 1, status: "DONE", taskId: secondTaskId },
        ],
      }),
    ).rejects.toThrow("Tasks must belong to a single board.");
  });

  test("includes cross-board in-progress tasks ordered by dashboard sort then creation time", async () => {
    const user = await createTestUser();
    const [firstBoard, secondBoard] = boardRows(user.id, 2);

    await prisma.board.createMany({ data: [firstBoard, secondBoard] });
    await createDataTask({
      boardId: firstBoard.id,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Never reordered first",
    });
    await createDataTask({
      boardId: secondBoard.id,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Never reordered second",
    });
    await createDataTask({
      boardId: secondBoard.id,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      dashboardSortOrder: 1,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Dashboard second",
    });
    await createDataTask({
      boardId: firstBoard.id,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
      dashboardSortOrder: 0,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Dashboard first",
    });
    await createDataTask({
      boardId: firstBoard.id,
      status: PrismaTaskStatus.DONE,
      title: "Done task",
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(snapshot.inProgressTasks.map((task) => task.title)).toEqual([
      "Dashboard first",
      "Dashboard second",
      "Never reordered first",
      "Never reordered second",
    ]);
    expect(snapshot.inProgressTasks.map((task) => task.boardSlug)).toEqual([
      firstBoard.slug,
      secondBoard.slug,
      firstBoard.slug,
      secondBoard.slug,
    ]);
  });

  test("sorts dashboard due-date groups and equal dashboard orders", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueEarlierId = randomUUID();
    const overdueLaterId = randomUUID();
    const upcomingEarlierId = randomUUID();
    const upcomingLaterId = randomUUID();
    const inProgressEarlierId = randomUUID();
    const inProgressLaterId = randomUUID();

    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime() - 24 * 60 * 60 * 1000),
      id: overdueLaterId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Overdue later",
    });
    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000),
      id: overdueEarlierId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Overdue earlier",
    });
    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
      id: upcomingLaterId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Upcoming later",
    });
    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      id: upcomingEarlierId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Upcoming earlier",
    });
    await createDataTask({
      boardId: board.id,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      dashboardSortOrder: 4,
      id: inProgressLaterId,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Equal order later",
    });
    await createDataTask({
      boardId: board.id,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      dashboardSortOrder: 4,
      id: inProgressEarlierId,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Equal order earlier",
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(snapshot.overdueTasks.map((task) => task.id)).toEqual([
      overdueEarlierId,
      overdueLaterId,
    ]);
    expect(snapshot.upcomingTasks.map((task) => task.id)).toEqual([
      upcomingEarlierId,
      upcomingLaterId,
    ]);
    expect(snapshot.inProgressTasks.map((task) => task.id)).toEqual([
      inProgressEarlierId,
      inProgressLaterId,
    ]);
  });

  test("buckets due-today and due-soon tasks (next 3 days, excluding today) separately", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueTodayEarlierId = randomUUID();
    const dueTodayLaterId = randomUUID();
    const dueSoonEarlierId = randomUUID();
    const dueSoonLaterId = randomUUID();
    const dueTooFarId = randomUUID();

    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime() + 18 * 60 * 60 * 1000),
      id: dueTodayLaterId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Due today, later in the day",
    });
    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime()),
      id: dueTodayEarlierId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Due today, midnight",
    });
    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
      id: dueSoonLaterId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Due in 3 days",
    });
    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      id: dueSoonEarlierId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Due tomorrow",
    });
    await createDataTask({
      boardId: board.id,
      dueDate: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000),
      id: dueTooFarId,
      status: PrismaTaskStatus.ON_DECK,
      title: "Due in 4 days -- outside the due-soon window",
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(snapshot.dueTodayTasks.map((task) => task.id)).toEqual([
      dueTodayEarlierId,
      dueTodayLaterId,
    ]);
    expect(snapshot.dueSoonTasks.map((task) => task.id)).toEqual([
      dueSoonEarlierId,
      dueSoonLaterId,
    ]);
  });

  test("includes recently completed tasks within the last seven days, sorted newest first", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const now = new Date();
    const recentTaskId = randomUUID();
    const olderRecentTaskId = randomUUID();
    const staleTaskId = randomUUID();

    await createDataTask({
      boardId: board.id,
      completedAt: subDays(now, 1),
      id: recentTaskId,
      status: PrismaTaskStatus.DONE,
      title: "Completed yesterday",
    });
    await createDataTask({
      boardId: board.id,
      completedAt: subDays(now, 5),
      id: olderRecentTaskId,
      status: PrismaTaskStatus.DONE,
      title: "Completed five days ago",
    });
    await createDataTask({
      boardId: board.id,
      completedAt: subDays(now, 10),
      id: staleTaskId,
      status: PrismaTaskStatus.DONE,
      title: "Completed ten days ago",
    });
    await createDataTask({
      boardId: board.id,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Still in progress",
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(snapshot.recentlyCompletedTasks.map((task) => task.id)).toEqual([
      recentTaskId,
      olderRecentTaskId,
    ]);
  });

  test("includes ordered subtasks on dashboard in-progress task summaries", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const taskWithSubtasksId = randomUUID();
    const taskWithoutSubtasksId = randomUUID();
    const firstSubtaskId = randomUUID();
    const secondSubtaskId = randomUUID();

    await createDataTask({
      boardId: board.id,
      id: taskWithSubtasksId,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Task with subtasks",
    });
    await createDataTask({
      boardId: board.id,
      id: taskWithoutSubtasksId,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Task without subtasks",
    });
    await prisma.subtask.createMany({
      data: [
        {
          id: secondSubtaskId,
          isComplete: false,
          sortOrder: 1,
          taskId: taskWithSubtasksId,
          title: "Wire toggle",
        },
        {
          id: firstSubtaskId,
          isComplete: true,
          sortOrder: 0,
          taskId: taskWithSubtasksId,
          title: "Load subtasks",
        },
      ],
    });

    const snapshot = await getDashboardSnapshot(user.id);

    expect(
      snapshot.inProgressTasks.find((task) => task.id === taskWithSubtasksId)?.subtasks,
    ).toEqual([
      {
        id: firstSubtaskId,
        isComplete: true,
        title: "Load subtasks",
      },
      {
        id: secondSubtaskId,
        isComplete: false,
        title: "Wire toggle",
      },
    ]);
    expect(
      snapshot.inProgressTasks.find((task) => task.id === taskWithoutSubtasksId)?.subtasks,
    ).toEqual([]);
  });

  test("reorders dashboard in-progress tasks without changing board sort order", async () => {
    const user = await createTestUser();
    const [firstBoard, secondBoard] = boardRows(user.id, 2);
    const firstTaskId = randomUUID();
    const secondTaskId = randomUUID();
    const thirdTaskId = randomUUID();

    await prisma.board.createMany({ data: [firstBoard, secondBoard] });
    await createDataTask({
      boardId: firstBoard.id,
      id: firstTaskId,
      sortOrder: 7,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "First task",
    });
    await createDataTask({
      boardId: secondBoard.id,
      id: secondTaskId,
      sortOrder: 3,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Second task",
    });
    await createDataTask({
      boardId: firstBoard.id,
      id: thirdTaskId,
      sortOrder: 9,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Third task",
    });

    await reorderDashboardInProgressForUser(user.id, [
      thirdTaskId,
      firstTaskId,
      secondTaskId,
    ]);

    const tasks = await prisma.task.findMany({
      select: {
        dashboardSortOrder: true,
        id: true,
        sortOrder: true,
      },
      where: {
        id: {
          in: [firstTaskId, secondTaskId, thirdTaskId],
        },
      },
    });

    expect(new Map(tasks.map((task) => [task.id, task]))).toEqual(
      new Map([
        [firstTaskId, { dashboardSortOrder: 1, id: firstTaskId, sortOrder: 7 }],
        [secondTaskId, { dashboardSortOrder: 2, id: secondTaskId, sortOrder: 3 }],
        [thirdTaskId, { dashboardSortOrder: 0, id: thirdTaskId, sortOrder: 9 }],
      ]),
    );

    await expect(getDashboardSnapshot(user.id)).resolves.toMatchObject({
      inProgressTasks: [
        { id: thirdTaskId },
        { id: firstTaskId },
        { id: secondTaskId },
      ],
    });
  });

  test("ignores duplicate task ids when reordering dashboard in-progress tasks", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const firstTaskId = randomUUID();
    const secondTaskId = randomUUID();

    await createDataTask({
      boardId: board.id,
      id: firstTaskId,
      sortOrder: 1,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "First task",
    });
    await createDataTask({
      boardId: board.id,
      id: secondTaskId,
      sortOrder: 2,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Second task",
    });

    await reorderDashboardInProgressForUser(user.id, [
      secondTaskId,
      firstTaskId,
      secondTaskId,
    ]);

    const tasks = await prisma.task.findMany({
      select: {
        dashboardSortOrder: true,
        id: true,
      },
      where: {
        id: {
          in: [firstTaskId, secondTaskId],
        },
      },
    });

    expect(new Map(tasks.map((task) => [task.id, task]))).toEqual(
      new Map([
        [firstTaskId, { dashboardSortOrder: 1, id: firstTaskId }],
        [secondTaskId, { dashboardSortOrder: 0, id: secondTaskId }],
      ]),
    );
  });

  test("rejects dashboard reordering for another user or non-in-progress tasks", async () => {
    const owner = await createTestUser({ email: "owner-dashboard@example.test" });
    const otherUser = await createTestUser({ email: "other-dashboard@example.test" });
    const ownerBoard = await createTestBoard(owner.id);
    const otherBoard = await createTestBoard(otherUser.id);
    const ownerTaskId = randomUUID();
    const otherTaskId = randomUUID();

    await createDataTask({
      boardId: ownerBoard.id,
      id: ownerTaskId,
      status: PrismaTaskStatus.ON_DECK,
    });
    await createDataTask({
      boardId: otherBoard.id,
      id: otherTaskId,
      status: PrismaTaskStatus.IN_PROGRESS,
    });

    await expect(
      reorderDashboardInProgressForUser(owner.id, [otherTaskId]),
    ).rejects.toThrow("One or more tasks could not be found.");
    await expect(
      reorderDashboardInProgressForUser(owner.id, [ownerTaskId]),
    ).rejects.toThrow("One or more tasks could not be found.");

    await expect(
      prisma.task.findUniqueOrThrow({
        select: {
          dashboardSortOrder: true,
        },
        where: { id: ownerTaskId },
      }),
    ).resolves.toEqual({ dashboardSortOrder: null });
  });

  test("reorders boards for a user by slug", async () => {
    const user = await createTestUser();
    const [firstBoard, secondBoard, thirdBoard] = boardRows(user.id, 3);
    await prisma.board.createMany({ data: [firstBoard, secondBoard, thirdBoard] });

    await reorderBoardsForUser(user.id, [thirdBoard.slug, firstBoard.slug, secondBoard.slug]);

    const boards = await prisma.board.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, sortOrder: true },
      where: { userId: user.id },
    });

    expect(boards).toEqual([
      { slug: thirdBoard.slug, sortOrder: 0 },
      { slug: firstBoard.slug, sortOrder: 1 },
      { slug: secondBoard.slug, sortOrder: 2 },
    ]);
  });

  test("ignores duplicate slugs and assigns a contiguous order", async () => {
    const user = await createTestUser();
    const [firstBoard, secondBoard] = boardRows(user.id, 2);
    await prisma.board.createMany({ data: [firstBoard, secondBoard] });

    await reorderBoardsForUser(user.id, [secondBoard.slug, firstBoard.slug, secondBoard.slug]);

    const boards = await prisma.board.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, sortOrder: true },
      where: { userId: user.id },
    });

    expect(boards).toEqual([
      { slug: secondBoard.slug, sortOrder: 0 },
      { slug: firstBoard.slug, sortOrder: 1 },
    ]);
  });

  test("rejects reordering boards for another user or an unknown slug", async () => {
    const owner = await createTestUser({ email: "owner-boards@example.test" });
    const otherUser = await createTestUser({ email: "other-boards@example.test" });
    const [ownerBoard] = boardRows(owner.id, 1);
    const [otherBoard] = boardRows(otherUser.id, 1);
    otherBoard.slug = "other-user-board";
    await prisma.board.createMany({ data: [ownerBoard, otherBoard] });

    await expect(reorderBoardsForUser(owner.id, [otherBoard.slug])).rejects.toThrow(
      "One or more boards could not be found.",
    );
    await expect(
      reorderBoardsForUser(owner.id, [ownerBoard.slug, "not-a-real-slug"]),
    ).rejects.toThrow("One or more boards could not be found.");

    await expect(
      prisma.board.findUniqueOrThrow({
        select: { sortOrder: true },
        where: { id: ownerBoard.id },
      }),
    ).resolves.toEqual({ sortOrder: ownerBoard.sortOrder });
  });

  test("marks a task done at the end of its board done column", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);
    const taskId = randomUUID();

    await createDataTask({
      boardId: board.id,
      sortOrder: 0,
      status: PrismaTaskStatus.DONE,
      title: "Existing done task",
    });
    await createDataTask({
      boardId: board.id,
      dashboardSortOrder: 0,
      description: "Keep this description",
      id: taskId,
      sortOrder: 7,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Finish me",
    });
    await prisma.subtask.create({
      data: {
        id: randomUUID(),
        isComplete: false,
        sortOrder: 0,
        taskId,
        title: "Preserved subtask",
      },
    });

    const task = await markTaskDoneForUser(user.id, taskId);

    expect(task).toMatchObject({
      archivedAt: null,
      completedAt: expect.any(Date),
      description: "Keep this description",
      sortOrder: 1,
      status: PrismaTaskStatus.DONE,
      title: "Finish me",
    });
    await expect(prisma.subtask.count({ where: { taskId } })).resolves.toBe(1);
    await expect(getDashboardSnapshot(user.id)).resolves.toMatchObject({
      inProgressTasks: [],
    });
  });

  test("markTaskDoneForUser does not spawn a second row for a recurring task", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: "Keep cadence visible",
      dueDate: "2026-05-05",
      priority: "HIGH",
      recurrence: "WEEKLY",
      status: "IN_PROGRESS",
      subtasks: [
        {
          isComplete: false,
          title: "Draft notes",
        },
        {
          isComplete: true,
          title: "Review last week",
        },
      ],
      title: "Weekly review",
    });

    const completedTask = await markTaskDoneForUser(user.id, task.id);

    expect(completedTask).toMatchObject({
      status: PrismaTaskStatus.DONE,
      title: "Weekly review",
    });

    const tasks = await boardTasksWithSubtasks(board.id);
    expect(tasks).toHaveLength(1);
    const [only] = tasks;
    expect(only).toMatchObject({
      id: task.id,
      recurrence: PrismaRecurrencePattern.WEEKLY,
      status: PrismaTaskStatus.DONE,
    });
    expect(only?.dueDate?.toISOString()).toBe("2026-05-05T00:00:00.000Z");
    expect(only?.completedAt).toBeInstanceOf(Date);

    // Completing an already-done recurring task again must still not spawn a row.
    await markTaskDoneForUser(user.id, task.id);
    await expect(prisma.task.count({ where: { boardId: board.id } })).resolves.toBe(1);
  });

  test("updateTaskForUser does not spawn a second row when a recurring task transitions to done", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: "Original description",
      dueDate: "2026-06-10",
      priority: "LOW",
      recurrence: "WEEKLY",
      status: "ON_DECK",
      subtasks: [
        {
          isComplete: false,
          title: "Original step",
        },
      ],
      title: "Refresh runbook",
    });

    const updatedTask = await updateTaskForUser(user.id, task.id, {
      description: "Updated description",
      dueDate: "2026-06-10",
      priority: "MEDIUM",
      recurrence: "WEEKLY",
      status: "DONE",
      subtasks: [
        {
          id: task.subtasks[0]?.id,
          isComplete: true,
          title: "Updated step",
        },
      ],
      title: "Updated runbook",
    });

    expect(updatedTask.status).toBe("DONE");
    expect(updatedTask.dueDate?.slice(0, 10)).toBe("2026-06-10");
    await expect(prisma.task.count({ where: { boardId: board.id } })).resolves.toBe(1);

    // Re-saving the already-done task again must still not spawn a row.
    await updateTaskForUser(user.id, task.id, {
      description: updatedTask.description,
      dueDate: updatedTask.dueDate?.slice(0, 10) ?? null,
      priority: updatedTask.priority,
      recurrence: updatedTask.recurrence,
      status: "DONE",
      subtasks: updatedTask.subtasks.map((subtask) => ({
        id: subtask.id,
        isComplete: subtask.isComplete,
        title: subtask.title,
      })),
      title: updatedTask.title,
    });

    await expect(prisma.task.count({ where: { boardId: board.id } })).resolves.toBe(1);
  });

  test("provisionDemoUser creates an isolated USER-role demo sandbox", async () => {
    const first = await provisionDemoUser();
    const second = await provisionDemoUser();

    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe("Bilbo Baggins");

    const record = await prisma.user.findUnique({
      where: { id: first.id },
      select: {
        role: true,
        demoExpiresAt: true,
        boards: { include: { tasks: true } },
      },
    });

    expect(record?.role).toBe("USER");
    expect(record?.demoExpiresAt).toBeInstanceOf(Date);
    expect(record?.demoExpiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
    expect(record?.boards).toHaveLength(3);
    expect(record?.boards.reduce((sum, board) => sum + board.tasks.length, 0)).toBeGreaterThan(0);
  });

  test("purgeExpiredDemoUsers removes expired demo accounts but keeps real and unexpired ones", async () => {
    const realUser = await createTestUser();
    const expiredDemo = await provisionDemoUser();
    const liveDemo = await provisionDemoUser();

    await prisma.user.update({
      where: { id: expiredDemo.id },
      data: { demoExpiresAt: subDays(new Date(), 1) },
    });

    const deleted = await purgeExpiredDemoUsers();

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.user.findUnique({ where: { id: expiredDemo.id } })).toBeNull();
    expect(await prisma.board.count({ where: { userId: expiredDemo.id } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: liveDemo.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: realUser.id } })).not.toBeNull();
  });

  test("rejects marking another user's task done", async () => {
    const owner = await createTestUser({ email: "done-owner@example.test" });
    const otherUser = await createTestUser({ email: "done-other@example.test" });
    const otherBoard = await createTestBoard(otherUser.id);
    const otherTaskId = randomUUID();

    await createDataTask({
      boardId: otherBoard.id,
      id: otherTaskId,
      status: PrismaTaskStatus.IN_PROGRESS,
    });

    await expect(markTaskDoneForUser(owner.id, otherTaskId)).rejects.toThrow("Task not found.");

    await expect(
      prisma.task.findUniqueOrThrow({
        select: {
          status: true,
        },
        where: { id: otherTaskId },
      }),
    ).resolves.toEqual({ status: PrismaTaskStatus.IN_PROGRESS });
  });

  test("lists revoked, accepted, expired, and pending invitations", async () => {
    const inviter = await createTestUser();
    const now = new Date();

    await prisma.invitation.createMany({
      data: [
        {
          email: "revoked@example.test",
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          id: randomUUID(),
          invitedById: inviter.id,
          revokedAt: now,
          tokenHash: sha256("revoked-invitation"),
        },
        {
          acceptedAt: now,
          email: "accepted@example.test",
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          id: randomUUID(),
          invitedById: inviter.id,
          tokenHash: sha256("accepted-invitation"),
        },
        {
          email: "expired@example.test",
          expiresAt: subDays(now, 1),
          id: randomUUID(),
          invitedById: inviter.id,
          tokenHash: sha256("expired-invitation"),
        },
        {
          email: "pending@example.test",
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          id: randomUUID(),
          invitedById: inviter.id,
          tokenHash: sha256("pending-invitation"),
        },
      ],
    });

    const invitations = await listInvitations();
    const statuses = Object.fromEntries(
      invitations.map((invitation) => [invitation.email, invitation.status]),
    );

    expect(statuses).toEqual({
      "accepted@example.test": "ACCEPTED",
      "expired@example.test": "EXPIRED",
      "pending@example.test": "PENDING",
      "revoked@example.test": "REVOKED",
    });
  });

  test("rolls back account creation when invitation acceptance races revocation", async () => {
    const distribution = { accepted: 0, revoked: 0 };

    for (let iteration = 0; iteration < 20; iteration += 1) {
      const email = `accept-revoke-race-${iteration}@example.test`;
      const inviter = await createTestUser({
        email: `accept-revoke-inviter-${iteration}@example.test`,
      });
      const { invitation, token } = await createInvitation({
        email,
        invitedById: inviter.id,
      });

      const [acceptance, revocation] = await Promise.all([
        captureOutcome(() =>
          createUserAccountWithInvitation({
            email,
            inviteToken: token,
            name: `Accept Revoke Race ${iteration}`,
            passwordHash: "accept-revoke-password-hash",
          }),
        ),
        captureOutcome(() => revokeInvitation(invitation.id)),
      ]);

      expect(acceptance.status).toBe("fulfilled");
      if (acceptance.status === "rejected") {
        throw acceptance.reason;
      }
      expect(revocation.status).toBe("fulfilled");
      if (revocation.status === "rejected") {
        throw revocation.reason;
      }

      const [persistedUser, persistedInvitation] = await Promise.all([
        prisma.user.findUnique({ where: { email } }),
        prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } }),
      ]);

      if (acceptance.value.status === "invalid-invitation") {
        distribution.revoked += 1;
        expect(revocation.value).toEqual({ email, id: invitation.id });
        expect(persistedUser).toBeNull();
        expect(persistedInvitation).toMatchObject({
          acceptedAt: null,
          acceptedByUserId: null,
          revokedAt: expect.any(Date),
        });
      } else if (acceptance.value.status === "created") {
        distribution.accepted += 1;
        expect(revocation.value).toBeNull();
        expect(persistedUser?.id).toBe(acceptance.value.user.id);
        expect(persistedInvitation).toMatchObject({
          acceptedAt: expect.any(Date),
          acceptedByUserId: acceptance.value.user.id,
          revokedAt: null,
        });
      } else {
        throw new Error(`Unexpected invitation acceptance status: ${acceptance.value.status}`);
      }
    }

    console.info("accept/revoke race distribution", distribution);
    expect(distribution.revoked).toBeGreaterThan(0);
  });

  test("rethrows the unique-email error from concurrent identical invitation accepts", async () => {
    const email = "concurrent-invitation-accept@example.test";
    const inviter = await createTestUser({
      email: "concurrent-invitation-inviter@example.test",
    });
    const { invitation, token } = await createInvitation({
      email,
      invitedById: inviter.id,
    });
    const input = {
      email,
      inviteToken: token,
      name: "Concurrent Invitation Accept",
      passwordHash: "concurrent-accept-password-hash",
    };

    const outcomes = await Promise.all([
      captureOutcome(() => createUserAccountWithInvitation(input)),
      captureOutcome(() => createUserAccountWithInvitation(input)),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const winner = fulfilled[0];
    const loser = rejected[0];
    if (!winner || !loser) {
      throw new Error("Expected one fulfilled and one rejected invitation acceptance.");
    }
    expect(winner.value.status).toBe("created");
    const loserError = errorDetails(loser.reason);
    expect(loserError).toMatchObject({ code: "P2002" });
    expect(loserError.message).toContain("Unique constraint failed");
    expect(loserError.message).not.toBe("Invitation could not be accepted.");

    const [users, persistedInvitation] = await Promise.all([
      prisma.user.findMany({ where: { email } }),
      prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } }),
    ]);
    expect(users).toHaveLength(1);
    expect(persistedInvitation).toMatchObject({
      acceptedAt: expect.any(Date),
      acceptedByUserId: users[0]?.id,
      revokedAt: null,
    });
    console.info("identical accept race distribution", {
      created: fulfilled.length,
      rejected: rejected.length,
      rejectedCode: loserError.code,
      rejectedMessage: loserError.message,
    });
  });

  test("allows only one concurrent reset with the same password token", async () => {
    const user = await createTestUser();
    const { token } = await createPasswordResetToken(user.id);

    const results = await Promise.all([
      resetPasswordWithToken(token, "hash-one"),
      resetPasswordWithToken(token, "hash-two"),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });

  test("creates API tokens with hash-only persistence and scopes", async () => {
    const user = await createTestUser({
      email: "admin@example.test",
      name: "Admin User",
    });
    const scopes = [ApiTokenScope.BOARDS_READ, ApiTokenScope.TASKS_READ];

    const { apiToken, token } = await createApiToken({
      createdById: user.id,
      label: "  External Consumer  ",
      scopes,
    });

    expect(token).toMatch(/^wbk_/);
    expect(apiToken).toMatchObject({
      createdBy: {
        email: user.email,
        name: user.name,
      },
      label: "External Consumer",
      prefix: token.slice(0, 12),
      scopes,
      expiresAt: null,
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
    expect(row.scopes).toEqual(scopes);
    expect(row.expiresAt).toBeNull();
    expect(rowValues).not.toContain(token);
  });

  test("creates API tokens with optional expiry dates", async () => {
    const user = await createTestUser();
    const startedAt = Date.now();
    const { apiToken } = await createApiToken({
      createdById: user.id,
      expiresInDays: 30,
      label: "Thirty-day consumer",
      scopes: defaultReadApiTokenScopes,
    });
    const finishedAt = Date.now();
    const expiryMs = new Date(apiToken.expiresAt ?? "").getTime();

    expect(apiToken.status).toBe("ACTIVE");
    expect(apiToken.expiresAt).toEqual(expect.any(String));
    expect(expiryMs).toBeGreaterThanOrEqual(startedAt + 30 * 86_400_000);
    expect(expiryMs).toBeLessThanOrEqual(finishedAt + 30 * 86_400_000 + 1_000);

    const row = await prisma.apiToken.findUniqueOrThrow({
      where: { id: apiToken.id },
    });

    expect(row.expiresAt?.getTime()).toBe(expiryMs);
  });

  test("findActiveApiTokenByRawToken returns token owner and scopes", async () => {
    const user = await createTestUser();
    const scopes = [ApiTokenScope.SUBTASKS_READ];
    const { apiToken, token } = await createApiToken({
      createdById: user.id,
      label: "Scoped consumer",
      scopes,
    });

    await expect(findActiveApiTokenByRawToken(token)).resolves.toEqual({
      createdById: user.id,
      id: apiToken.id,
      scopes,
    });
  });

  test("findActiveApiTokenByRawToken returns null for an empty token", async () => {
    await expect(findActiveApiTokenByRawToken("")).resolves.toBeNull();
  });

  test("rejects expired API tokens and serializes expired status", async () => {
    const user = await createTestUser();
    const { apiToken, token } = await createApiToken({
      createdById: user.id,
      expiresInDays: 1,
      label: "Expired consumer",
      scopes: defaultReadApiTokenScopes,
    });

    await prisma.apiToken.update({
      data: { expiresAt: new Date(Date.now() - 1_000) },
      where: { id: apiToken.id },
    });

    await expect(findActiveApiTokenByRawToken(token)).resolves.toBeNull();

    const [listedToken] = await listApiTokens();
    expect(listedToken).toMatchObject({
      expiresAt: expect.any(String),
      id: apiToken.id,
      status: "EXPIRED",
    });
  });

  test("reports revoked status when an API token is both revoked and expired", async () => {
    const user = await createTestUser();
    const { apiToken } = await createApiToken({
      createdById: user.id,
      expiresInDays: 1,
      label: "Revoked expired consumer",
      scopes: defaultReadApiTokenScopes,
    });

    await prisma.apiToken.update({
      data: {
        expiresAt: new Date(Date.now() - 1_000),
        revokedAt: new Date(),
      },
      where: { id: apiToken.id },
    });

    const [listedToken] = await listApiTokens();
    expect(listedToken).toMatchObject({
      expiresAt: expect.any(String),
      id: apiToken.id,
      revokedAt: expect.any(String),
      status: "REVOKED",
    });
  });

  test("lists API tokens newest first without exposing token hashes", async () => {
    const user = await createTestUser();
    const first = await createApiToken({
      createdById: user.id,
      label: "First consumer",
      scopes: defaultReadApiTokenScopes,
    });
    const second = await createApiToken({
      createdById: user.id,
      label: "Second consumer",
      scopes: defaultReadApiTokenScopes,
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
      scopes: defaultReadApiTokenScopes,
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
