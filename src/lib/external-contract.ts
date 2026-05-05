import { z } from "zod";

import { boardStatuses, itemPriorities } from "@/lib/domain";

const isoDateTimeSchema = z.iso.datetime();

const externalBoardSummarySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  iconKey: z.string().min(1),
  totalTasks: z.number().int().nonnegative(),
});

const externalSubtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  isComplete: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  priority: z.enum(itemPriorities),
});

const externalTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(boardStatuses),
  sortOrder: z.number().int().nonnegative(),
  priority: z.enum(itemPriorities),
  dueDate: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  subtasks: z.array(externalSubtaskSchema),
});

export const externalDashboardResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
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
  }),
});

export const externalBoardsResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    boards: z.array(externalBoardSummarySchema),
  }),
});

export const externalBoardResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    iconKey: z.string().min(1),
    noteContent: z.string(),
    tasks: z.array(externalTaskSchema),
  }),
});

export const externalDailySummaryTaskStatusSchema = z.enum([
  "ice-box",
  "on-deck",
  "in-progress",
  "done",
  "archived",
]);

export const externalDailySummaryPrioritySchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

export const externalDailySummaryTaskSchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: externalDailySummaryTaskStatusSchema,
  category: z.string().min(1),
  priority: externalDailySummaryPrioritySchema,
  parentId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const externalDailySummaryCountSchema = z.number().int().nonnegative();

export const externalDailySummaryResponseSchema = z.object({
  generatedAt: isoDateTimeSchema,
  summary: z.object({
    totalActive: externalDailySummaryCountSchema,
    completionRate: z.string().regex(/^\d+%$/),
    byStatus: z.object({
      iceBox: externalDailySummaryCountSchema,
      onDeck: externalDailySummaryCountSchema,
      inProgress: externalDailySummaryCountSchema,
      done: externalDailySummaryCountSchema,
      archived: externalDailySummaryCountSchema,
    }),
    byCategory: z.record(z.string().min(1), externalDailySummaryCountSchema),
  }),
  inProgress: z.array(externalDailySummaryTaskSchema),
  onDeck: z.array(externalDailySummaryTaskSchema),
  iceBox: z.array(externalDailySummaryTaskSchema),
  recentlyCompleted: z.array(externalDailySummaryTaskSchema),
});

export type ExternalDailySummaryResponse = z.infer<
  typeof externalDailySummaryResponseSchema
>;
export type ExternalDailySummaryTask = z.infer<typeof externalDailySummaryTaskSchema>;
