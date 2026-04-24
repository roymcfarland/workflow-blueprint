import { z } from "zod";

import { boardStatuses } from "@/lib/domain";

const isoDateTimeSchema = z.iso.datetime();

export const readOnlyBoardSummarySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  iconKey: z.string().min(1),
  totalTasks: z.number().int().nonnegative(),
});

export const readOnlySubtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  isComplete: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export const readOnlyTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(boardStatuses),
  sortOrder: z.number().int().nonnegative(),
  dueDate: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  subtasks: z.array(readOnlySubtaskSchema),
});

export const readOnlyBoardSnapshotSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  iconKey: z.string().min(1),
  noteContent: z.string(),
  tasks: z.array(readOnlyTaskSchema),
});

export const readOnlyDashboardSchema = z.object({
  boardBreakdown: z.array(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      iconKey: z.string().min(1),
      totalTasks: z.number().int().nonnegative(),
      percentage: z.number().int().min(0).max(100),
    }),
  ),
  sprintCompletionRate: z.number().int().min(0).max(100),
  doneCount: z.number().int().nonnegative(),
  activeTaskCount: z.number().int().nonnegative(),
  inProgressCount: z.number().int().nonnegative(),
  closedLastSevenDays: z.number().int().nonnegative(),
  totalTaskCount: z.number().int().nonnegative(),
});

export const readOnlyDashboardResponseSchema = z.object({
  ok: z.literal(true),
  data: readOnlyDashboardSchema,
});

export const readOnlyBoardsResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    boards: z.array(readOnlyBoardSummarySchema),
  }),
});

export const readOnlyBoardResponseSchema = z.object({
  ok: z.literal(true),
  data: readOnlyBoardSnapshotSchema,
});
