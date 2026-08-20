import { ApiTokenScope } from "@/generated/prisma/client";

import { updateBoardNote } from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import {
  externalBoardNoteRequestSchema,
  externalOkResponseSchema,
} from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function messageForError(error: unknown) {
  /* v8 ignore next */
  return error instanceof Error ? error.message : "Board note mutation failed.";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/boards/[slug]/note",
    async ({ requestId, user }) => {
      const { slug } = await params;
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return externalApiError("Invalid JSON body.", 400, undefined, requestId);
      }

      const parsed = externalBoardNoteRequestSchema.safeParse(body);

      if (!parsed.success) {
        /* v8 ignore next */
        return externalApiError(
          parsed.error.issues[0]?.message ?? "Invalid board note payload.",
          400,
          undefined,
          requestId,
        );
      }

      try {
        await updateBoardNote(user.userId, slug, parsed.data.content);

        return externalApiJson(
          externalOkResponseSchema,
          { ok: true },
          undefined,
          requestId,
        );
      } catch (error) {
        const message = messageForError(error);
        /* v8 ignore next */
        const status = message.toLowerCase().includes("not found") ? 404 : 400;

        return externalApiError(message, status, undefined, requestId);
      }
    },
    { requiredScope: ApiTokenScope.BOARDS_WRITE },
  );
}
