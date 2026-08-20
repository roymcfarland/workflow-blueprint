import { ApiTokenScope } from "@/generated/prisma/client";

import { deleteSubtaskForUser, updateSubtaskForUser } from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  externalSubtaskUpdateRequestSchema,
  externalTaskResponseSchema,
} from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function messageForError(error: unknown) {
  /* v8 ignore next */
  return error instanceof Error ? error.message : "Subtask mutation failed.";
}

function statusForSubtaskMutationError(message: string) {
  /* v8 ignore next */
  return message.toLowerCase().includes("not found") ? 404 : 400;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/subtasks/[id]",
    async ({ requestId, user }) => {
      const { id } = await params;
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return externalApiError("Invalid JSON body.", 400, undefined, requestId);
      }

      const parsed = externalSubtaskUpdateRequestSchema.safeParse(body);

      if (!parsed.success) {
        /* v8 ignore next */
        return externalApiError(
          parsed.error.issues[0]?.message ?? "Invalid subtask payload.",
          400,
          undefined,
          requestId,
        );
      }

      try {
        const parentTask = await updateSubtaskForUser(user.userId, id, parsed.data);

        return externalApiJson(
          externalTaskResponseSchema,
          { ok: true, data: parentTask },
          undefined,
          requestId,
        );
      } catch (error) {
        const message = messageForError(error);

        return externalApiError(
          message,
          statusForSubtaskMutationError(message),
          undefined,
          requestId,
        );
      }
    },
    { requiredScope: ApiTokenScope.SUBTASKS_WRITE },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/subtasks/[id]",
    async ({ requestId, user }) => {
      const { id } = await params;

      try {
        const parentTask = await deleteSubtaskForUser(user.userId, id);

        return externalApiJson(
          externalTaskResponseSchema,
          { ok: true, data: parentTask },
          undefined,
          requestId,
        );
      } catch (error) {
        const message = messageForError(error);

        return externalApiError(
          message,
          statusForSubtaskMutationError(message),
          undefined,
          requestId,
        );
      }
    },
    { requiredScope: ApiTokenScope.SUBTASKS_WRITE },
  );
}
