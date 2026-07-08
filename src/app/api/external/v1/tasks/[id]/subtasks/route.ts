import { ApiTokenScope } from "@/generated/prisma/client";

import { createSubtaskForUser } from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  externalSubtaskCreateRequestSchema,
  externalTaskResponseSchema,
} from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function messageForError(error: unknown) {
  return error instanceof Error ? error.message : "Subtask mutation failed.";
}

function statusForSubtaskMutationError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("not found")) {
    return 404;
  }

  if (normalized.includes("maximum") || normalized.includes("up to 50")) {
    return 409;
  }

  return 400;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/tasks/[id]/subtasks",
    async ({ requestId, user }) => {
      const { id } = await params;
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return externalApiError("Invalid JSON body.", 400, undefined, requestId);
      }

      const parsed = externalSubtaskCreateRequestSchema.safeParse(body);

      if (!parsed.success) {
        return externalApiError(
          parsed.error.issues[0]?.message ?? "Invalid subtask payload.",
          400,
          undefined,
          requestId,
        );
      }

      try {
        const parentTask = await createSubtaskForUser(user.userId, id, parsed.data);

        return externalApiJson(
          externalTaskResponseSchema,
          { ok: true, data: parentTask },
          { status: 201 },
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
