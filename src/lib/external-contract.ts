import { z } from "zod";

import {
  boardAccentPalette,
  boardIconKeys,
  boardStatuses,
  itemPriorities,
  recurrencePatterns,
} from "@/lib/domain";

const isoDateTimeSchema = z.iso.datetime();
const externalDueDateSchema = z
  .iso.date("Enter a valid due date (YYYY-MM-DD).")
  .nullable();
const externalBoardIconKeySchema = z.enum(
  boardIconKeys as unknown as [string, ...string[]],
);
const externalBoardAccentColorSchema = z.enum(
  boardAccentPalette as unknown as [string, ...string[]],
);
const externalBoardNameSchema = z
  .string()
  .trim()
  .min(1, "Board name is required.")
  .max(60, "Board names should stay under 60 characters.");
const externalBoardDescriptionSchema = z
  .string()
  .trim()
  .max(200, "Descriptions should stay under 200 characters.")
  .nullable();
const externalSubtaskTitleSchema = z
  .string()
  .trim()
  .min(1, "Subtask title is required.")
  .max(180, "Subtask titles should stay under 180 characters.");

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
  recurrence: z.enum(recurrencePatterns),
  subtasks: z.array(externalSubtaskSchema),
});

export const externalTaskCreateRequestSchema = z.object({
  boardSlug: z.string().min(1),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1200).nullable().default(null),
  status: z.enum(boardStatuses).default("ON_DECK"),
  dueDate: externalDueDateSchema.default(null),
  priority: z.enum(itemPriorities).default("NONE"),
  recurrence: z.enum(recurrencePatterns).default("NONE"),
});

export const externalTaskUpdateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(1200).nullable(),
    status: z.enum(boardStatuses),
    dueDate: externalDueDateSchema,
    priority: z.enum(itemPriorities),
    recurrence: z.enum(recurrencePatterns),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const externalBoardCreateRequestSchema = z.object({
  name: externalBoardNameSchema,
  iconKey: externalBoardIconKeySchema.default("briefcase"),
  description: externalBoardDescriptionSchema.default(null),
  accentColor: externalBoardAccentColorSchema.optional(),
});

export const externalBoardUpdateRequestSchema = z
  .object({
    name: externalBoardNameSchema,
    iconKey: externalBoardIconKeySchema,
    description: externalBoardDescriptionSchema,
    accentColor: externalBoardAccentColorSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const externalBoardNoteRequestSchema = z.object({
  content: z.string().trim().max(5000, "Notes should stay under 5000 characters."),
});

export const externalSubtaskCreateRequestSchema = z.object({
  title: externalSubtaskTitleSchema,
});

export const externalSubtaskUpdateRequestSchema = z
  .object({
    title: externalSubtaskTitleSchema.optional(),
    isComplete: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const externalTaskResponseSchema = z.object({
  ok: z.literal(true),
  data: externalTaskSchema,
});

export const externalOkResponseSchema = z.object({ ok: z.literal(true) });

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

export const externalBoardWriteResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    iconKey: z.string().min(1),
    accentColor: z.string().nullable(),
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
