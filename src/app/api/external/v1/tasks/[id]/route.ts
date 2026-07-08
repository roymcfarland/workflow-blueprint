import { ApiTokenScope } from "@/generated/prisma/client";

import { deleteTaskForUser, updateTaskFieldsForUser } from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  externalOkResponseSchema,
  externalTaskResponseSchema,
  externalTaskUpdateRequestSchema,
} from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function messageForError(error: unknown) {
  return error instanceof Error ? error.message : "Task mutation failed.";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/tasks/[id]",
    async ({ requestId, user }) => {
      const { id } = await params;
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return externalApiError("Invalid JSON body.", 400, undefined, requestId);
      }

      const parsed = externalTaskUpdateRequestSchema.safeParse(body);

      if (!parsed.success) {
        return externalApiError(
          parsed.error.issues[0]?.message ?? "Invalid task payload.",
          400,
          undefined,
          requestId,
        );
      }

      const fields = { ...parsed.data };

      if ("description" in fields) {
        fields.description = fields.description ? fields.description : null;
      }

      try {
        const task = await updateTaskFieldsForUser(user.userId, id, fields);

        return externalApiJson(
          externalTaskResponseSchema,
          { ok: true, data: task },
          undefined,
          requestId,
        );
      } catch (error) {
        const message = messageForError(error);

        if (message.toLowerCase().includes("not found")) {
          return externalApiError(message, 404, undefined, requestId);
        }

        return externalApiError(message, 400, undefined, requestId);
      }
    },
    { requiredScope: ApiTokenScope.TASKS_WRITE },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/tasks/[id]",
    async ({ requestId, user }) => {
      const { id } = await params;

      try {
        await deleteTaskForUser(user.userId, id);

        return externalApiJson(
          externalOkResponseSchema,
          { ok: true },
          undefined,
          requestId,
        );
      } catch (error) {
        const message = messageForError(error);

        if (message.toLowerCase().includes("not found")) {
          return externalApiError(message, 404, undefined, requestId);
        }

        return externalApiError(message, 400, undefined, requestId);
      }
    },
    { requiredScope: ApiTokenScope.TASKS_WRITE },
  );
}
