import { ApiTokenScope } from "@/generated/prisma/client";

import { createBoardForUser, getBoardSummaries } from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  externalBoardCreateRequestSchema,
  externalBoardsResponseSchema,
  externalBoardWriteResponseSchema,
} from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function messageForError(error: unknown) {
  /* v8 ignore next */
  return error instanceof Error ? error.message : "Board mutation failed.";
}

function statusForBoardMutationError(message: string) {
  const normalized = message.toLowerCase();

  /* v8 ignore if */
  if (normalized.includes("not found")) {
    return 404;
  }

  if (normalized.includes("maximum") || normalized.includes("already exists")) {
    return 409;
  }

  return 400;
}

export async function GET(request: Request) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/boards",
    async ({ requestId, user }) => {
      return externalApiJson(
        externalBoardsResponseSchema,
        {
          ok: true,
          data: {
            boards: await getBoardSummaries(user.userId),
          },
        },
        undefined,
        requestId,
      );
    },
    { requiredScope: ApiTokenScope.BOARDS_READ },
  );
}

export async function POST(request: Request) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/boards",
    async ({ requestId, user }) => {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return externalApiError("Invalid JSON body.", 400, undefined, requestId);
      }

      const parsed = externalBoardCreateRequestSchema.safeParse(body);

      if (!parsed.success) {
        /* v8 ignore next */
        return externalApiError(
          parsed.error.issues[0]?.message ?? "Invalid board payload.",
          400,
          undefined,
          requestId,
        );
      }

      try {
        const board = await createBoardForUser(user.userId, {
          ...parsed.data,
          description: parsed.data.description ? parsed.data.description : null,
        });

        return externalApiJson(
          externalBoardWriteResponseSchema,
          { ok: true, data: board },
          { status: 201 },
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
