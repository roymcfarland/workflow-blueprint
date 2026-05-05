import { getBoardSummaries } from "@/lib/data";
import {
  externalApiJson,
  requireExternalApiUser,
  withExternalApiObservability,
} from "@/lib/external-api";
import { externalBoardsResponseSchema } from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiObservability(
    request,
    "/api/external/v1/boards",
    async ({ requestId }) => {
      const user = await requireExternalApiUser(request, { requestId });

      if (!user.ok) {
        return user.response;
      }

      return externalApiJson(
        externalBoardsResponseSchema,
        {
          ok: true,
          data: {
            boards: await getBoardSummaries(user.data.userId),
          },
        },
        undefined,
        requestId,
      );
    },
  );
}
