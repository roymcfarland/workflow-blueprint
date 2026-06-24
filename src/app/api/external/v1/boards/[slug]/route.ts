import { ApiTokenScope } from "@prisma/client";

import { getBoardSnapshot } from "@/lib/data";
import {
  externalApiError,
  externalApiJson,
  withExternalApiObservability,
} from "@/lib/external-api";
import { externalBoardResponseSchema } from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

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
