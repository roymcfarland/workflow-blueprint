import { ApiTokenScope } from "@prisma/client";

import { createTaskForBoard } from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  externalTaskCreateRequestSchema,
  externalTaskResponseSchema,
} from "@/lib/external-contract";
import type { TaskInput } from "@/lib/validators";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function messageForError(error: unknown) {
  return error instanceof Error ? error.message : "Task mutation failed.";
}

export async function POST(request: Request) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/tasks",
    async ({ requestId, user }) => {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return externalApiError("Invalid JSON body.", 400, undefined, requestId);
      }

      const parsed = externalTaskCreateRequestSchema.safeParse(body);

      if (!parsed.success) {
        return externalApiError(
          parsed.error.issues[0]?.message ?? "Invalid task payload.",
          400,
          undefined,
          requestId,
        );
      }

      const { boardSlug, ...fields } = parsed.data;
      const taskInput: TaskInput = {
        ...fields,
        description: fields.description ? fields.description : null,
        subtasks: [],
      };

      try {
        const task = await createTaskForBoard(user.userId, boardSlug, taskInput);

        return externalApiJson(
          externalTaskResponseSchema,
          { ok: true, data: task },
          { status: 201 },
          requestId,
        );
      } catch (error) {
        const message = messageForError(error);

        if (message.toLowerCase().includes("not found")) {
          return externalApiError(message, 404, undefined, requestId);
        }

        if (message.toLowerCase().includes("maximum")) {
          return externalApiError(message, 409, undefined, requestId);
        }

        return externalApiError(message, 400, undefined, requestId);
      }
    },
    { requiredScope: ApiTokenScope.TASKS_WRITE },
  );
}
