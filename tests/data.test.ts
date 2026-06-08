import {
  ItemPriority as PrismaItemPriority,
  RecurrencePattern as PrismaRecurrencePattern,
  TaskStatus as PrismaTaskStatus,
} from "@prisma/client";
import { addMonths } from "date-fns";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, test, beforeEach } from "vitest";

import {
  createApiToken,
  createBoardForUser,
  createChecklistItemForTask,
  createLabelForTask,
  createTaskForBoard,
  deleteChecklistItemForUser,
  deleteLabelForUser,
  getDashboardSnapshot,
  getBoardSnapshot,
  getShellSnapshot,
  listApiTokens,
  markTaskDoneForUser,
  MAX_BOARDS_PER_USER,
  MAX_TASKS_PER_BOARD,
  reorderDashboardInProgressForUser,
  reorderTasksForUser,
  updateBoardForUser,
  updateChecklistItemForUser,
  revokeApiToken,
  updateTaskForUser,
} from "@/lib/data";
import { prisma } from "@/lib/db";
import {
  labelColorPalette,
  MAX_CHECKLIST_ITEMS_PER_TASK,
  MAX_LABELS_PER_TASK,
  starterBoard,
} from "@/lib/domain";
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
  createdAt,
  dashboardSortOrder,
  description = null,
  id = randomUUID(),
  sortOrder = 0,
  status = PrismaTaskStatus.ON_DECK,
  title = "Task",
}: {
  boardId: string;
  completedAt?: Date | null;
  createdAt?: Date;
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
      dashboardSortOrder,
      description,
      ...(createdAt ? { createdAt } : {}),
      id,
      sortOrder,
      status,
      title,
    },
  });
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

  test("markTaskDoneForUser spawns the next recurring occurrence", async () => {
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
    const original = tasks.find((row) => row.id === task.id);
    const nextOccurrence = tasks.find((row) => row.id !== task.id);

    expect(tasks).toHaveLength(2);
    expect(original).toMatchObject({
      completedAt: expect.any(Date),
      status: PrismaTaskStatus.DONE,
    });
    expect(nextOccurrence).toMatchObject({
      archivedAt: null,
      boardId: board.id,
      completedAt: null,
      description: "Keep cadence visible",
      priority: PrismaItemPriority.HIGH,
      recurrence: PrismaRecurrencePattern.WEEKLY,
      sortOrder: 0,
      status: PrismaTaskStatus.IN_PROGRESS,
      title: "Weekly review",
    });
    expect(nextOccurrence?.dueDate?.toISOString()).toBe("2026-05-12T00:00:00.000Z");
    expect(
      nextOccurrence?.subtasks.map((subtask) => ({
        isComplete: subtask.isComplete,
        sortOrder: subtask.sortOrder,
        title: subtask.title,
      })),
    ).toEqual([
      {
        isComplete: false,
        sortOrder: 0,
        title: "Draft notes",
      },
      {
        isComplete: false,
        sortOrder: 1,
        title: "Review last week",
      },
    ]);
    expect(
      nextOccurrence?.subtasks.some((subtask) =>
        task.subtasks.some((sourceSubtask) => sourceSubtask.id === subtask.id),
      ),
    ).toBe(false);
  });

  test("markTaskDoneForUser does not spawn a non-recurring task", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: "2026-05-05",
      priority: "NONE",
      recurrence: "NONE",
      status: "IN_PROGRESS",
      subtasks: [],
      title: "One-time task",
    });

    await markTaskDoneForUser(user.id, task.id);

    await expect(prisma.task.count({ where: { boardId: board.id } })).resolves.toBe(1);
  });

  test("markTaskDoneForUser does not double-spawn an already-done recurring task", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: "2026-05-05",
      priority: "NONE",
      recurrence: "DAILY",
      status: "IN_PROGRESS",
      subtasks: [],
      title: "Daily check-in",
    });

    await markTaskDoneForUser(user.id, task.id);
    await expect(prisma.task.count({ where: { boardId: board.id } })).resolves.toBe(2);

    await markTaskDoneForUser(user.id, task.id);

    await expect(prisma.task.count({ where: { boardId: board.id } })).resolves.toBe(2);
  });

  test("updateTaskForUser spawns once when a recurring task transitions to done", async () => {
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

    const tasks = await boardTasksWithSubtasks(board.id);
    const nextOccurrence = tasks.find((row) => row.id !== task.id);

    expect(tasks).toHaveLength(2);
    expect(nextOccurrence).toMatchObject({
      archivedAt: null,
      boardId: board.id,
      completedAt: null,
      description: "Updated description",
      priority: PrismaItemPriority.MEDIUM,
      recurrence: PrismaRecurrencePattern.WEEKLY,
      status: PrismaTaskStatus.ON_DECK,
      title: "Updated runbook",
    });
    expect(nextOccurrence?.dueDate?.toISOString()).toBe("2026-06-17T00:00:00.000Z");
    expect(
      nextOccurrence?.subtasks.map((subtask) => ({
        isComplete: subtask.isComplete,
        sortOrder: subtask.sortOrder,
        title: subtask.title,
      })),
    ).toEqual([
      {
        isComplete: false,
        sortOrder: 0,
        title: "Updated step",
      },
    ]);

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

    await expect(prisma.task.count({ where: { boardId: board.id } })).resolves.toBe(2);
  });

  test("recurring tasks without due dates anchor the next occurrence to completion time", async () => {
    const user = await createTestUser();
    const board = await createTestBoard(user.id);

    const task = await createTaskForBoard(user.id, starterBoard.slug, {
      description: null,
      dueDate: null,
      priority: "NONE",
      recurrence: "MONTHLY",
      status: "ON_DECK",
      subtasks: [],
      title: "Monthly closeout",
    });

    await markTaskDoneForUser(user.id, task.id);

    const tasks = await boardTasksWithSubtasks(board.id);
    const original = tasks.find((row) => row.id === task.id);
    const nextOccurrence = tasks.find((row) => row.id !== task.id);

    expect(original?.completedAt).toBeInstanceOf(Date);
    expect(nextOccurrence?.dueDate).toBeInstanceOf(Date);
    if (!original?.completedAt || !nextOccurrence?.dueDate) {
      throw new Error("Expected a completed source task and next occurrence due date.");
    }
    expect(
      Math.abs(nextOccurrence.dueDate.getTime() - addMonths(original.completedAt, 1).getTime()),
    ).toBeLessThan(1000);
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
