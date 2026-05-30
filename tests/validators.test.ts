import { describe, expect, test } from "vitest";

import { adminApiTokenSchema, taskReorderSchema } from "@/lib/validators";

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
});
