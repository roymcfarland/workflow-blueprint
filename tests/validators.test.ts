import { describe, expect, test } from "vitest";

import { ATTACHMENT_MAX_BYTES } from "@/lib/domain";
import {
  adminApiTokenSchema,
  attachmentMetaSchema,
  attachmentRecordSchema,
  boardReorderSchema,
  checklistCreateSchema,
  checklistUpdateSchema,
  createBoardSchema,
  dashboardReorderSchema,
  labelCreateSchema,
  profileSchema,
  subtaskReorderSchema,
  taskInputSchema,
  taskReorderSchema,
  updateBoardSchema,
} from "@/lib/validators";

describe("src/lib/validators.ts", () => {
  test("validates admin API token labels", () => {
    const result = adminApiTokenSchema.safeParse({
      label: "  External Consumer  ",
      scopes: ["BOARDS_READ", "TASKS_READ"],
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected valid API token label.");
    }
    expect(result.data.label).toBe("External Consumer");
    expect(result.data.scopes).toEqual(["BOARDS_READ", "TASKS_READ"]);
    expect(result.data.expiresInDays).toBeUndefined();
    expect(adminApiTokenSchema.safeParse({ label: "   ", scopes: ["BOARDS_READ"] }).success).toBe(
      false,
    );
    expect(
      adminApiTokenSchema.safeParse({ label: "a".repeat(81), scopes: ["BOARDS_READ"] }).success,
    ).toBe(false);
    expect(adminApiTokenSchema.safeParse({ label: "External Consumer", scopes: [] }).success).toBe(
      false,
    );
    expect(
      adminApiTokenSchema.safeParse({ label: "External Consumer", scopes: ["ADMIN_READ"] }).success,
    ).toBe(false);
  });

  test("validates optional admin API token expiry windows", () => {
    const basePayload = {
      label: "External Consumer",
      scopes: ["BOARDS_READ"],
    };

    expect(adminApiTokenSchema.safeParse(basePayload).success).toBe(true);
    expect(adminApiTokenSchema.safeParse({ ...basePayload, expiresInDays: 30 }).success).toBe(
      true,
    );
    expect(adminApiTokenSchema.safeParse({ ...basePayload, expiresInDays: 0 }).success).toBe(
      false,
    );
    expect(adminApiTokenSchema.safeParse({ ...basePayload, expiresInDays: 366 }).success).toBe(
      false,
    );
    expect(adminApiTokenSchema.safeParse({ ...basePayload, expiresInDays: 1.5 }).success).toBe(
      false,
    );
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

  test("preserves non-empty task and board descriptions", () => {
    const task = taskInputSchema.parse({
      description: "  Confirm launch readiness  ",
      dueDate: null,
      priority: "NONE",
      status: "ON_DECK",
      subtasks: [],
      title: "Launch",
    });
    const board = createBoardSchema.parse({
      description: "  Launch planning  ",
      iconKey: "briefcase",
      name: "Launch Board",
    });

    expect(task.description).toBe("Confirm launch readiness");
    expect(board.description).toBe("Launch planning");
  });

  test("validates label creation against text limits and the preset palette", () => {
    const result = labelCreateSchema.safeParse({
      color: "#3b82f6",
      text: "  Customer  ",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected valid label payload.");
    }
    expect(result.data).toEqual({
      color: "#3b82f6",
      text: "Customer",
    });
    expect(labelCreateSchema.safeParse({ color: "#123456", text: "Customer" }).success).toBe(
      false,
    );
    expect(labelCreateSchema.safeParse({ color: "#3b82f6", text: "   " }).success).toBe(false);
    expect(labelCreateSchema.safeParse({ color: "#3b82f6", text: "a".repeat(31) }).success).toBe(
      false,
    );
  });

  test("validates checklist creation text limits", () => {
    const result = checklistCreateSchema.safeParse({
      text: "  Confirm launch owner  ",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected valid checklist payload.");
    }
    expect(result.data.text).toBe("Confirm launch owner");
    expect(checklistCreateSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(checklistCreateSchema.safeParse({ text: "a".repeat(181) }).success).toBe(false);
  });

  test("validates attachment metadata and records", () => {
    const meta = {
      contentType: "application/pdf",
      fileName: "  launch-plan.pdf  ",
      size: ATTACHMENT_MAX_BYTES,
    };

    const metaResult = attachmentMetaSchema.safeParse(meta);

    expect(metaResult.success).toBe(true);
    if (!metaResult.success) {
      throw new Error("Expected valid attachment metadata.");
    }
    expect(metaResult.data.fileName).toBe("launch-plan.pdf");
    expect(
      attachmentRecordSchema.safeParse({
        ...meta,
        storagePath: "tasks/task_1/upload_1",
      }).success,
    ).toBe(true);
    expect(attachmentMetaSchema.safeParse({ ...meta, contentType: "application/zip" }).success)
      .toBe(false);
    expect(attachmentMetaSchema.safeParse({ ...meta, size: ATTACHMENT_MAX_BYTES + 1 }).success)
      .toBe(false);
    expect(attachmentRecordSchema.safeParse(meta).success).toBe(false);
  });

  test("validates checklist updates require at least one field", () => {
    expect(
      checklistUpdateSchema.safeParse({
        isComplete: true,
        text: "Confirm launch owner",
      }).success,
    ).toBe(true);
    expect(checklistUpdateSchema.safeParse({}).success).toBe(false);
    expect(checklistUpdateSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(checklistUpdateSchema.safeParse({ text: "a".repeat(181) }).success).toBe(false);
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

describe("task input validation", () => {
  const validTaskPayload = {
    description: null,
    dueDate: null,
    priority: "NONE",
    status: "ON_DECK",
    subtasks: [],
    title: "Validate task input",
  };

  test("accepts a valid calendar due date", () => {
    const result = taskInputSchema.safeParse({ ...validTaskPayload, dueDate: "2026-07-21" });

    expect(result.success).toBe(true);
  });

  test.each(["2026-02-30", "not-a-date"])("rejects invalid due date %s", (dueDate) => {
    const result = taskInputSchema.safeParse({ ...validTaskPayload, dueDate });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected invalid due date to be rejected.");
    }
    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Enter a valid due date.",
        path: ["dueDate"],
      }),
    ]);
  });

  test.each([
    { dueDate: 12345, label: "non-string" },
    { dueDate: "   ", label: "whitespace-only" },
  ])("coerces a $label due date to null", ({ dueDate }) => {
    const result = taskInputSchema.safeParse({ ...validTaskPayload, dueDate });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected due date to be coerced to null.");
    }
    expect(result.data.dueDate).toBeNull();
  });

  test("rejects duplicate subtask ids", () => {
    const result = taskInputSchema.safeParse({
      ...validTaskPayload,
      subtasks: [
        { id: "subtask_1", title: "First subtask" },
        { id: "subtask_1", title: "Second subtask" },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected duplicate subtask ids to be rejected.");
    }
    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Task payload contains duplicate subtasks.",
        path: ["subtasks", 1, "id"],
      }),
    ]);
  });

  test.each([
    {
      label: "different ids",
      subtasks: [
        { id: "subtask_1", title: "First subtask" },
        { id: "subtask_2", title: "Second subtask" },
      ],
    },
    {
      label: "no ids",
      subtasks: [{ title: "First subtask" }, { title: "Second subtask" }],
    },
  ])("accepts subtasks with $label", ({ subtasks }) => {
    expect(taskInputSchema.safeParse({ ...validTaskPayload, subtasks }).success).toBe(true);
  });
});

describe("reorder payload validation", () => {
  test("rejects duplicate subtask ids", () => {
    const result = subtaskReorderSchema.safeParse({
      subtaskIds: ["subtask_1", "subtask_1"],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected duplicate subtask ids to be rejected.");
    }
    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Reorder payload contains duplicate subtask ids.",
        path: ["subtaskIds", 1],
      }),
    ]);
  });

  test("rejects duplicate board slugs", () => {
    const result = boardReorderSchema.safeParse({
      boardSlugs: ["launch", "launch"],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected duplicate board slugs to be rejected.");
    }
    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Reorder payload contains duplicate board slugs.",
        path: ["boardSlugs", 1],
      }),
    ]);
  });
});

describe("profile password validation", () => {
  const validProfilePayload = {
    email: "alex@example.com",
    name: "Alex Morgan",
    themePreference: "system",
  };

  test("rejects a new password shorter than eight characters", () => {
    const result = profileSchema.safeParse({
      ...validProfilePayload,
      confirmPassword: "short",
      newPassword: "short",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected a short new password to be rejected.");
    }
    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "New password must be at least 8 characters.",
        path: ["newPassword"],
      }),
    ]);
  });

  test("rejects mismatched new passwords", () => {
    const result = profileSchema.safeParse({
      ...validProfilePayload,
      confirmPassword: "password-two",
      newPassword: "password-one",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected mismatched passwords to be rejected.");
    }
    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Passwords must match.",
        path: ["confirmPassword"],
      }),
    ]);
  });
});
