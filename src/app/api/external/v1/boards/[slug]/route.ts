import { ApiTokenScope } from "@/generated/prisma/client";

import {
  deleteBoardForUser,
  getBoardSnapshot,
  updateBoardForUser,
} from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  externalBoardResponseSchema,
  externalBoardUpdateRequestSchema,
  externalBoardWriteResponseSchema,
  externalOkResponseSchema,
} from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function messageForError(error: unknown) {
  return error instanceof Error ? error.message : "Board mutation failed.";
}

function statusForBoardMutationError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("not found")) {
    return 404;
  }

  if (normalized.includes("maximum") || normalized.includes("already exists")) {
    return 409;
  }

  return 400;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/boards/[slug]",
    async ({ requestId, user }) => {
      const { slug } = await params;
      const board = await getBoardSnapshot(user.userId, slug);

      if (!board) {
        return externalApiError("Board not found.", 404, undefined, requestId);
      }

      return externalApiJson(
        externalBoardResponseSchema,
        {
          ok: true,
          data: board,
        },
        undefined,
        requestId,
      );
    },
    { requiredScope: ApiTokenScope.BOARDS_READ },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/boards/[slug]",
    async ({ requestId, user }) => {
      const { slug } = await params;
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return externalApiError("Invalid JSON body.", 400, undefined, requestId);
      }

      const parsed = externalBoardUpdateRequestSchema.safeParse(body);

      if (!parsed.success) {
        return externalApiError(
          parsed.error.issues[0]?.message ?? "Invalid board payload.",
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
        const result = await updateBoardForUser(
          user.userId,
          slug,
          fields as Parameters<typeof updateBoardForUser>[2],
        );

        return externalApiJson(
          externalBoardWriteResponseSchema,
          { ok: true, data: result.updated },
          undefined,
          requestId,
        );
      } catch (error) {
        const message = messageForError(error);

        return externalApiError(
          message,
          statusForBoardMutationError(message),
          undefined,
          requestId,
        );
      }
    },
    { requiredScope: ApiTokenScope.BOARDS_WRITE },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/boards/[slug]",
    async ({ requestId, user }) => {
      const { slug } = await params;

      try {
        await deleteBoardForUser(user.userId, slug);

        return externalApiJson(
          externalOkResponseSchema,
          { ok: true },
          undefined,
          requestId,
        );
      } catch (error) {
        const message = messageForError(error);

        return externalApiError(
          message,
          statusForBoardMutationError(message),
          undefined,
          requestId,
        );
      }
    },
    { requiredScope: ApiTokenScope.BOARDS_WRITE },
  );
}
