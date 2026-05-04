import { describe, expect, test } from "vitest";

import { taskReorderSchema } from "@/lib/validators";

describe("src/lib/validators.ts", () => {
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
