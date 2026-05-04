import { getBoardSummaries } from "@/lib/data";
import {
  externalApiJson,
  requireExternalApiUser,
} from "@/lib/external-api";
import { externalBoardsResponseSchema } from "@/lib/external-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireExternalApiUser(request);

  if (!user.ok) {
    return user.response;
  }

  return externalApiJson(externalBoardsResponseSchema, {
    ok: true,
    data: {
      boards: await getBoardSummaries(user.data.userId),
    },
  });
}
