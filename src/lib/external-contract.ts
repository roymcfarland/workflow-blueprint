import { z } from "zod";

import {
  readOnlyBoardResponseSchema,
  readOnlyBoardsResponseSchema,
  readOnlyDashboardResponseSchema,
} from "@/lib/read-only-contract";

const isoDateTimeSchema = z.iso.datetime();

export const externalDashboardResponseSchema = readOnlyDashboardResponseSchema;
export const externalBoardsResponseSchema = readOnlyBoardsResponseSchema;
export const externalBoardResponseSchema = readOnlyBoardResponseSchema;

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
