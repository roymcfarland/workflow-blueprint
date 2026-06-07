import { describe, expect, test } from "vitest";

import {
  adminApiTokenSchema,
  createBoardSchema,
  dashboardReorderSchema,
  taskInputSchema,
  taskReorderSchema,
  updateBoardSchema,
} from "@/lib/validators";

describe("src/lib/validators.ts", () => {
  test("validates admin API token labels", () => {
    const result = adminApiTokenSchema.safeParse({
      label: "  External Consumer  ",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected valid API token label.");
    }
    expect(result.data.label).toBe("External Consumer");
    expect(adminApiTokenSchema.safeParse({ label: "   " }).success).toBe(false);
    expect(adminApiTokenSchema.safeParse({ label: "a".repeat(81) }).success).toBe(false);
  });

  test("defaults task recurrence to none", () => {
    const result = taskInputSchema.safeParse({
      description: null,
      dueDate: null,
      priority: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Follow up",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected valid task payload.");
    }
    expect(result.data.recurrence).toBe("NONE");
  });

  test("validates task recurrence values", () => {
    const taskPayload = {
      description: null,
      dueDate: null,
      priority: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Check cadence",
    };

    expect(taskInputSchema.safeParse({ ...taskPayload, recurrence: "WEEKLY" }).success).toBe(true);
    expect(taskInputSchema.safeParse({ ...taskPayload, recurrence: "HOURLY" }).success).toBe(false);
  });

  test("rejects duplicate task ids in reorder payloads", () => {
    const result = taskReorderSchema.safeParse({
      items: [
        {
          sortOrder: 0,
          status: "ON_DECK",
          taskId: "task_1",
        },
        {
          sortOrder: 1,
          status: "IN_PROGRESS",
          taskId: "task_1",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        message: "Task reorder payload contains duplicate tasks.",
        path: ["items", 1, "taskId"],
      }),
    ]);
  });

  test("validates dashboard reorder payloads", () => {
    expect(dashboardReorderSchema.safeParse({ taskIds: ["task_1", "task_2"] }).success).toBe(
      true,
    );
    expect(dashboardReorderSchema.safeParse({ taskIds: [] }).success).toBe(false);
  });

  test("validates board accent colors against the preset palette", () => {
    const createPayload = {
      accentColor: "#4f78e6",
      description: null,
      iconKey: "briefcase",
      name: "Launch Board",
    };

    expect(createBoardSchema.safeParse(createPayload).success).toBe(true);
    expect(updateBoardSchema.safeParse({ accentColor: "#4f78e6" }).success).toBe(true);
    expect(createBoardSchema.safeParse({ ...createPayload, accentColor: "#123456" }).success).toBe(
      false,
    );
    expect(updateBoardSchema.safeParse({ accentColor: "red" }).success).toBe(false);
  });

  test("rejects duplicate task ids in dashboard reorder payloads", () => {
    const result = dashboardReorderSchema.safeParse({
      taskIds: ["task_1", "task_2", "task_1"],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        message: "Reorder payload contains duplicate task ids.",
        path: ["taskIds", 2],
      }),
    ]);
  });
});
